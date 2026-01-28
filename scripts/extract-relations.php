#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Extract relationship graph from PHP codebase for LLM consumption.
 *
 * Outputs JSON with:
 * - Class hierarchy (extends, implements, uses traits)
 * - Type dependencies (types referenced in signatures)
 * - Instantiations (new ClassName)
 * - Static calls (ClassName::method)
 *
 * Usage:
 *   php scripts/extract-relations.php --root /path/to/src --ignore vendor,tests
 */

function usageAndExit(int $code): void {
  $msg = "Usage: extract-relations.php --root <dir> [--ignore dir1,dir2,...]\n";
  fwrite($code === 0 ? STDOUT : STDERR, $msg);
  exit($code);
}

function parseArgs(array $argv): array {
  $args = [
    'root' => null,
    'ignore' => [],
  ];

  for ($i = 1; $i < count($argv); $i++) {
    $arg = $argv[$i];
    if ($arg === '--help' || $arg === '-h') {
      usageAndExit(0);
    }
    if ($arg === '--root') {
      $args['root'] = $argv[$i + 1] ?? null;
      $i++;
      continue;
    }
    if ($arg === '--ignore') {
      $raw = $argv[$i + 1] ?? '';
      $args['ignore'] = array_values(array_filter(array_map('trim', explode(',', $raw)), fn($v) => $v !== ''));
      $i++;
      continue;
    }
  }

  return $args;
}

function tokenId($token): ?int {
  return is_array($token) ? $token[0] : null;
}

function tokenText($token): string {
  return is_array($token) ? $token[1] : (string) $token;
}

function tokenLine($token): int {
  return is_array($token) ? (int) $token[2] : 0;
}

function isIgnorableToken($token): bool {
  $id = tokenId($token);
  if ($id === null) return false;
  return $id === T_WHITESPACE || $id === T_COMMENT || $id === T_DOC_COMMENT;
}

function isNameToken($token): bool {
  $id = tokenId($token);
  if ($id === null) return false;
  if ($id === T_STRING || $id === T_NS_SEPARATOR) return true;
  if (defined('T_NAME_QUALIFIED') && $id === T_NAME_QUALIFIED) return true;
  if (defined('T_NAME_FULLY_QUALIFIED') && $id === T_NAME_FULLY_QUALIFIED) return true;
  if (defined('T_NAME_RELATIVE') && $id === T_NAME_RELATIVE) return true;
  return false;
}

function readQualifiedName(array $tokens, int $fromIdx): array {
  $count = count($tokens);
  $i = $fromIdx;
  while ($i < $count && isIgnorableToken($tokens[$i])) $i++;

  $name = '';
  while ($i < $count && isNameToken($tokens[$i])) {
    $name .= tokenText($tokens[$i]);
    $i++;
  }

  return [trim($name), $i];
}

function nextNonIgnorableIndex(array $tokens, int $from): int {
  for ($i = $from; $i < count($tokens); $i++) {
    if (!isIgnorableToken($tokens[$i])) {
      return $i;
    }
  }
  return -1;
}

function startsWithAnySegment(string $path, array $segments): bool {
  foreach ($segments as $seg) {
    if ($seg === '') continue;
    if (str_contains($path, DIRECTORY_SEPARATOR . $seg . DIRECTORY_SEPARATOR)) return true;
    if (str_ends_with($path, DIRECTORY_SEPARATOR . $seg)) return true;
    if (str_starts_with($path, $seg . DIRECTORY_SEPARATOR)) return true;
  }
  return false;
}

function relativePath(string $path, string $root): string {
  $root = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
  if (str_starts_with($path, $root)) {
    return str_replace(DIRECTORY_SEPARATOR, '/', substr($path, strlen($root)));
  }
  return str_replace(DIRECTORY_SEPARATOR, '/', $path);
}

/**
 * Normalize a type name - strip leading backslash, handle nullable.
 */
function normalizeType(string $type): string {
  $type = trim($type);
  $type = ltrim($type, '\\');
  return $type;
}

/**
 * Check if a type is a primitive/builtin (not a class reference).
 */
function isPrimitiveType(string $type): bool {
  $primitives = [
    'int', 'integer', 'float', 'double', 'string', 'bool', 'boolean',
    'array', 'object', 'callable', 'iterable', 'void', 'null', 'mixed',
    'true', 'false', 'never', 'self', 'static', 'parent', 'resource',
  ];
  $normalized = strtolower(ltrim($type, '?\\'));
  return in_array($normalized, $primitives, true);
}

/**
 * Extract types from a type string (handles unions, intersections, nullable).
 */
function extractTypesFromString(string $typeStr): array {
  $types = [];
  // Split on | and &
  $parts = preg_split('/[|&]/', $typeStr);
  foreach ($parts as $part) {
    $part = trim($part);
    $part = ltrim($part, '?'); // Remove nullable prefix
    $part = rtrim($part, '[]'); // Remove array suffix
    $part = normalizeType($part);
    if ($part !== '' && !isPrimitiveType($part)) {
      $types[] = $part;
    }
  }
  return array_unique($types);
}

/**
 * Extract relationships from a single PHP file.
 */
function extractRelationsFromFile(string $filePath, string $root): array {
  $code = @file_get_contents($filePath);
  if ($code === false) {
    return [];
  }

  $tokens = token_get_all($code);
  $namespace = '';
  $useStatements = []; // alias => FQCN
  $classes = [];
  $currentClass = null;
  $braceLevel = 0;
  $classStack = []; // each: ['name' => string, 'braceLevel' => int]

  $count = count($tokens);
  for ($i = 0; $i < $count; $i++) {
    $tok = $tokens[$i];
    $id = tokenId($tok);
    $text = tokenText($tok);

    if ($text === '{') {
      $braceLevel++;
      continue;
    }

    if ($text === '}') {
      if (!empty($classStack)) {
        $top = $classStack[count($classStack) - 1];
        if ($top['braceLevel'] === $braceLevel) {
          array_pop($classStack);
        }
      }
      $braceLevel = max(0, $braceLevel - 1);
      continue;
    }

    // Track namespace
    if ($id === T_NAMESPACE) {
      $nsParts = '';
      $j = $i + 1;
      while ($j < $count) {
        $t = $tokens[$j];
        $tt = tokenText($t);
        $tid = tokenId($t);
        if ($tt === ';' || $tt === '{') break;
        if ($tid !== T_WHITESPACE && $tid !== T_COMMENT && $tid !== T_DOC_COMMENT) {
          $nsParts .= $tt;
        }
        $j++;
      }
      $namespace = trim($nsParts, " \t\n\r\0\x0B\\");
      continue;
    }

    // Track use statements for alias resolution
    if ($id === T_USE && $braceLevel === 0) {
      $j = $i + 1;
      while ($j < $count) {
        while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
        [$fqcn, $j] = readQualifiedName($tokens, $j);
        if ($fqcn === '') break;
        $fqcn = ltrim($fqcn, '\\');

        $alias = null;
        while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
        if ($j < $count && tokenId($tokens[$j]) === T_AS) {
          $j++;
          while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
          if ($j < $count && tokenId($tokens[$j]) === T_STRING) {
            $alias = tokenText($tokens[$j]);
            $j++;
          }
        }

        if ($alias === null) {
          $parts = explode('\\', $fqcn);
          $alias = end($parts);
        }

        $useStatements[$alias] = $fqcn;

        while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
        $next = $j < $count ? tokenText($tokens[$j]) : '';
        if ($next === ',') {
          $j++;
          continue;
        }
        break;
      }
      continue;
    }

    // Class/interface/trait declaration
    $isClassDecl = $id === T_CLASS || $id === T_INTERFACE || $id === T_TRAIT;
    if ($isClassDecl) {
      // Skip Foo::class
      $prevIdx = $i - 1;
      while ($prevIdx >= 0 && isIgnorableToken($tokens[$prevIdx])) $prevIdx--;
      if ($prevIdx >= 0 && tokenText($tokens[$prevIdx]) === '::') {
        continue;
      }

      $kind = $id === T_INTERFACE ? 'interface' : ($id === T_TRAIT ? 'trait' : 'class');
      $nameIdx = nextNonIgnorableIndex($tokens, $i + 1);
      if ($nameIdx < 0) continue;
      $nameTok = $tokens[$nameIdx];
      if (tokenId($nameTok) !== T_STRING) continue;
      $name = tokenText($nameTok);
      $fqcn = $namespace !== '' ? ($namespace . '\\' . $name) : $name;

      $extends = [];
      $implements = [];
      $uses = []; // traits

      // Parse extends/implements
      for ($j = $nameIdx + 1; $j < $count; $j++) {
        $jt = $tokens[$j];
        $jid = tokenId($jt);
        $jtx = tokenText($jt);
        if ($jtx === '{') break;

        if ($jid === T_EXTENDS) {
          $j++;
          if ($kind === 'interface') {
            while ($j < $count) {
              [$n, $j] = readQualifiedName($tokens, $j);
              if ($n !== '') $extends[] = resolveType($n, $namespace, $useStatements);
              while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
              if ($j >= $count || tokenText($tokens[$j]) !== ',') break;
              $j++;
            }
          } else {
            [$n, $j] = readQualifiedName($tokens, $j);
            if ($n !== '') $extends[] = resolveType($n, $namespace, $useStatements);
          }
          $j--;
          continue;
        }

        if ($jid === T_IMPLEMENTS) {
          $j++;
          while ($j < $count) {
            [$n, $j] = readQualifiedName($tokens, $j);
            if ($n !== '') $implements[] = resolveType($n, $namespace, $useStatements);
            while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
            if ($j >= $count || tokenText($tokens[$j]) !== ',') break;
            $j++;
          }
          $j--;
          continue;
        }
      }

      $classes[$fqcn] = [
        'kind' => $kind,
        'name' => $name,
        'fqcn' => $fqcn,
        'namespace' => $namespace,
        'file' => relativePath($filePath, $root),
        'line' => tokenLine($tok),
        'extends' => $extends,
        'implements' => $implements,
        'uses' => [], // Will be populated when we find T_USE inside class
        'dependencies' => [], // Types in method signatures
        'instantiates' => [], // new ClassName
        'staticCalls' => [], // ClassName::method
      ];

      $classStack[] = ['fqcn' => $fqcn, 'braceLevel' => $braceLevel + 1];
      continue;
    }

    // Inside a class - track trait usage
    if (!empty($classStack) && $id === T_USE) {
      $currentFqcn = $classStack[count($classStack) - 1]['fqcn'];
      $j = $i + 1;
      while ($j < $count) {
        while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
        [$traitName, $j] = readQualifiedName($tokens, $j);
        if ($traitName === '') break;

        $resolvedTrait = resolveType($traitName, $namespace, $useStatements);
        if (!in_array($resolvedTrait, $classes[$currentFqcn]['uses'], true)) {
          $classes[$currentFqcn]['uses'][] = $resolvedTrait;
        }

        while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
        $next = $j < $count ? tokenText($tokens[$j]) : '';
        if ($next === ',') {
          $j++;
          continue;
        }
        break;
      }
      continue;
    }

    // Track 'new ClassName'
    if ($id === T_NEW && !empty($classStack)) {
      $currentFqcn = $classStack[count($classStack) - 1]['fqcn'];
      $j = nextNonIgnorableIndex($tokens, $i + 1);
      if ($j >= 0) {
        [$className, $endIdx] = readQualifiedName($tokens, $j);
        if ($className !== '' && !isPrimitiveType($className) && strtolower($className) !== 'self' && strtolower($className) !== 'static') {
          $resolved = resolveType($className, $namespace, $useStatements);
          if (!in_array($resolved, $classes[$currentFqcn]['instantiates'], true)) {
            $classes[$currentFqcn]['instantiates'][] = $resolved;
          }
        }
      }
      continue;
    }

    // Track static calls: ClassName::method or ClassName::$property
    if ($id === T_DOUBLE_COLON && !empty($classStack)) {
      $currentFqcn = $classStack[count($classStack) - 1]['fqcn'];
      // Look backwards for the class name
      $j = $i - 1;
      while ($j >= 0 && isIgnorableToken($tokens[$j])) $j--;

      if ($j >= 0) {
        // Collect the class name tokens going backwards
        $classNameParts = [];
        while ($j >= 0) {
          $jTok = $tokens[$j];
          if (isNameToken($jTok)) {
            array_unshift($classNameParts, tokenText($jTok));
            $j--;
          } else {
            break;
          }
        }

        $className = implode('', $classNameParts);
        if ($className !== '' && !in_array(strtolower($className), ['self', 'static', 'parent'], true)) {
          $resolved = resolveType($className, $namespace, $useStatements);
          if (!in_array($resolved, $classes[$currentFqcn]['staticCalls'], true)) {
            $classes[$currentFqcn]['staticCalls'][] = $resolved;
          }
        }
      }
      continue;
    }

    // Track type hints in function/method signatures
    if ($id === T_FUNCTION && !empty($classStack)) {
      $currentFqcn = $classStack[count($classStack) - 1]['fqcn'];

      // Find opening paren
      $j = nextNonIgnorableIndex($tokens, $i + 1);
      // Skip function name and &
      while ($j < $count && (tokenId($tokens[$j]) === T_STRING || tokenText($tokens[$j]) === '&')) {
        $j = nextNonIgnorableIndex($tokens, $j + 1);
      }

      if ($j < $count && tokenText($tokens[$j]) === '(') {
        $parenDepth = 1;
        $j++;

        // Scan until closing paren
        while ($j < $count && $parenDepth > 0) {
          $jTok = $tokens[$j];
          $jText = tokenText($jTok);

          if ($jText === '(') $parenDepth++;
          if ($jText === ')') $parenDepth--;

          if ($parenDepth > 0 && isNameToken($jTok)) {
            [$typeName, $endIdx] = readQualifiedName($tokens, $j);
            if ($typeName !== '' && !isPrimitiveType($typeName)) {
              $resolved = resolveType($typeName, $namespace, $useStatements);
              if (!in_array($resolved, $classes[$currentFqcn]['dependencies'], true)) {
                $classes[$currentFqcn]['dependencies'][] = $resolved;
              }
            }
            $j = $endIdx;
            continue;
          }

          $j++;
        }

        // Check for return type after )
        while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
        if ($j < $count && tokenText($tokens[$j]) === ':') {
          $j++;
          while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
          // Handle nullable
          if ($j < $count && tokenText($tokens[$j]) === '?') $j++;
          while ($j < $count && isIgnorableToken($tokens[$j])) $j++;

          if ($j < $count && isNameToken($tokens[$j])) {
            [$returnType, $endIdx] = readQualifiedName($tokens, $j);
            if ($returnType !== '' && !isPrimitiveType($returnType)) {
              $resolved = resolveType($returnType, $namespace, $useStatements);
              if (!in_array($resolved, $classes[$currentFqcn]['dependencies'], true)) {
                $classes[$currentFqcn]['dependencies'][] = $resolved;
              }
            }
          }
        }
      }
      continue;
    }
  }

  return array_values($classes);
}

/**
 * Resolve a type name to its fully qualified form.
 */
function resolveType(string $type, string $namespace, array $useStatements): string {
  $type = ltrim($type, '\\');

  // Already fully qualified
  if (str_contains($type, '\\')) {
    return $type;
  }

  // Check use statements
  if (isset($useStatements[$type])) {
    return $useStatements[$type];
  }

  // Assume same namespace
  if ($namespace !== '') {
    return $namespace . '\\' . $type;
  }

  return $type;
}

// Main execution
$args = parseArgs($argv);
$root = $args['root'];

if ($root === null || $root === '') {
  fwrite(STDERR, "Error: --root is required.\n");
  usageAndExit(2);
}

$root = rtrim($root, DIRECTORY_SEPARATOR);
if (!is_dir($root)) {
  fwrite(STDERR, "Error: root directory not found: {$root}\n");
  exit(2);
}

$ignoreDirs = $args['ignore'];

$allClasses = [];

$dirIter = new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS);
$iter = new RecursiveIteratorIterator($dirIter);

foreach ($iter as $fileInfo) {
  /** @var SplFileInfo $fileInfo */
  if (!$fileInfo->isFile()) continue;
  $path = $fileInfo->getPathname();
  if (!str_ends_with(strtolower($path), '.php')) continue;

  $rel = relativePath($path, $root);
  if (startsWithAnySegment($rel, $ignoreDirs)) continue;

  $classes = extractRelationsFromFile($path, $root);
  foreach ($classes as $class) {
    $allClasses[$class['fqcn']] = $class;
  }
}

// Build reverse relationships (usedBy)
foreach ($allClasses as $fqcn => &$class) {
  $class['usedBy'] = [];
}

foreach ($allClasses as $fqcn => $class) {
  // Add usedBy for extends
  foreach ($class['extends'] as $parent) {
    if (isset($allClasses[$parent])) {
      $allClasses[$parent]['usedBy'][] = $fqcn;
    }
  }
  // Add usedBy for implements
  foreach ($class['implements'] as $interface) {
    if (isset($allClasses[$interface])) {
      $allClasses[$interface]['usedBy'][] = $fqcn;
    }
  }
  // Add usedBy for trait usage
  foreach ($class['uses'] as $trait) {
    if (isset($allClasses[$trait])) {
      $allClasses[$trait]['usedBy'][] = $fqcn;
    }
  }
  // Add usedBy for dependencies
  foreach ($class['dependencies'] as $dep) {
    if (isset($allClasses[$dep])) {
      if (!in_array($fqcn, $allClasses[$dep]['usedBy'], true)) {
        $allClasses[$dep]['usedBy'][] = $fqcn;
      }
    }
  }
  // Add usedBy for instantiations
  foreach ($class['instantiates'] as $inst) {
    if (isset($allClasses[$inst])) {
      if (!in_array($fqcn, $allClasses[$inst]['usedBy'], true)) {
        $allClasses[$inst]['usedBy'][] = $fqcn;
      }
    }
  }
  // Add usedBy for static calls
  foreach ($class['staticCalls'] as $called) {
    if (isset($allClasses[$called])) {
      if (!in_array($fqcn, $allClasses[$called]['usedBy'], true)) {
        $allClasses[$called]['usedBy'][] = $fqcn;
      }
    }
  }
}

// Deduplicate usedBy arrays
foreach ($allClasses as $fqcn => &$class) {
  $class['usedBy'] = array_values(array_unique($class['usedBy']));
}

$result = [
  'generated' => date('c'),
  'root' => str_replace(DIRECTORY_SEPARATOR, '/', realpath($root) ?: $root),
  'stats' => [
    'classes' => count(array_filter($allClasses, fn($c) => $c['kind'] === 'class')),
    'interfaces' => count(array_filter($allClasses, fn($c) => $c['kind'] === 'interface')),
    'traits' => count(array_filter($allClasses, fn($c) => $c['kind'] === 'trait')),
  ],
  'symbols' => array_values($allClasses),
];

echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
