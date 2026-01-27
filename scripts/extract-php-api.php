#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Extract PHP API symbols (classes/interfaces/traits + functions) from a directory tree.
 *
 * Outputs JSON to stdout.
 *
 * Usage:
 *   php scripts/extract-php-api.php --root /path/to/src --ignore vendor,node_modules,tests
 */

function usageAndExit(int $code): void {
  $msg = "Usage: extract-php-api.php --root <dir> [--ignore dir1,dir2,...]\n";
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
  if ($id === null) {
    return false;
  }
  return $id === T_WHITESPACE || $id === T_COMMENT;
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

function prevNonIgnorableIndex(array $tokens, int $from): int {
  for ($i = $from; $i >= 0; $i--) {
    if (!isIgnorableToken($tokens[$i])) {
      return $i;
    }
  }
  return -1;
}

function nextNonIgnorableIndex(array $tokens, int $from): int {
  for ($i = $from; $i < count($tokens); $i++) {
    if (!isIgnorableToken($tokens[$i])) {
      return $i;
    }
  }
  return -1;
}

function normalizeSignature(string $sig): string {
  $sig = preg_replace('/\s+/', ' ', $sig ?? '') ?? '';
  $sig = trim($sig);
  $sig = preg_replace('/\s*([(),:;=|&?])\s*/', '$1', $sig) ?? $sig;
  $sig = preg_replace('/\)\s*:\s*/', '): ', $sig) ?? $sig;
  $sig = preg_replace('/,\s*/', ', ', $sig) ?? $sig;
  $sig = preg_replace('/\(\s*/', '(', $sig) ?? $sig;
  $sig = preg_replace('/\s*\)/', ')', $sig) ?? $sig;
  $sig = preg_replace('/\s+/', ' ', $sig) ?? $sig;
  $sig = convertLongArraysToShort($sig);
  return trim($sig);
}

function findMatchingParen(string $text, int $openIndex): int {
  $len = strlen($text);
  $depth = 1;
  $quote = null;
  $escape = false;

  for ($i = $openIndex + 1; $i < $len; $i++) {
    $ch = $text[$i];
    if ($quote !== null) {
      if ($escape) {
        $escape = false;
        continue;
      }
      if ($ch === '\\') {
        $escape = true;
        continue;
      }
      if ($ch === $quote) {
        $quote = null;
      }
      continue;
    }

    if ($ch === "'" || $ch === '"') {
      $quote = $ch;
      continue;
    }

    if ($ch === '(') $depth++;
    if ($ch === ')') {
      $depth--;
      if ($depth === 0) return $i;
    }
  }

  return -1;
}

function convertLongArraysToShort(string $text): string {
  $pattern = '/\barray\s*\(/i';
  while (preg_match($pattern, $text, $m, PREG_OFFSET_CAPTURE)) {
    $start = $m[0][1];
    $open = strpos($text, '(', $start);
    if ($open === false) {
      break;
    }
    $close = findMatchingParen($text, (int) $open);
    if ($close < 0) {
      break;
    }
    $inside = substr($text, $open + 1, $close - $open - 1);
    $inside = convertLongArraysToShort($inside);
    $text = substr($text, 0, $start) . '[' . $inside . ']' . substr($text, $close + 1);
  }
  return $text;
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

function extractSymbolsFromFile(string $filePath, string $root): array {
  $code = @file_get_contents($filePath);
  if ($code === false) {
    return ['classes' => [], 'functions' => []];
  }

  $tokens = token_get_all($code);
  $namespace = '';
  $lastDoc = null; // ['text' => string, 'line' => int]
  $braceLevel = 0;
  $bridgingDocTokenIds = [
    T_PUBLIC,
    T_PROTECTED,
    T_PRIVATE,
    T_STATIC,
    T_ABSTRACT,
    T_FINAL,
    T_FUNCTION,
    T_CLASS,
    T_INTERFACE,
    T_TRAIT,
  ];
  if (defined('T_READONLY')) {
    $bridgingDocTokenIds[] = T_READONLY;
  }
  if (defined('T_ATTRIBUTE')) {
    $bridgingDocTokenIds[] = T_ATTRIBUTE;
  }

  $classes = [];
  $functions = [];

  $pendingClassIndex = null;
  $classStack = []; // each: ['index' => int, 'braceLevel' => int]

  $count = count($tokens);
  for ($i = 0; $i < $count; $i++) {
    $tok = $tokens[$i];
    $id = tokenId($tok);
    $text = tokenText($tok);

    if ($id === T_DOC_COMMENT) {
      $startLine = tokenLine($tok);
      $endLine = $startLine + substr_count($text, "\n");
      $lastDoc = ['text' => $text, 'startLine' => $startLine, 'endLine' => $endLine];
      continue;
    }

    // If a docblock is followed by unrelated code (like file-guard `if (...)`),
    // prevent it from incorrectly attaching to the next symbol.
    if ($lastDoc && $id !== null && !isIgnorableToken($tok) && !in_array($id, $bridgingDocTokenIds, true) && $text !== '{' && $text !== '}' && $text !== ';') {
      $lastDoc = null;
    }

    if ($text === '{') {
      $braceLevel++;
      if ($pendingClassIndex !== null) {
        $classStack[] = ['index' => $pendingClassIndex, 'braceLevel' => $braceLevel];
        $pendingClassIndex = null;
      }
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

    if ($id === T_NAMESPACE) {
      $nsParts = '';
      $j = $i + 1;
      while ($j < $count) {
        $t = $tokens[$j];
        $tt = tokenText($t);
        $tid = tokenId($t);
        if ($tt === ';' || $tt === '{') {
          break;
        }
        if ($tid !== T_WHITESPACE && $tid !== T_COMMENT) {
          $nsParts .= $tt;
        }
        $j++;
      }
      $namespace = trim($nsParts, " \t\n\r\0\x0B\\");
      $lastDoc = null;
      continue;
    }

    $inClass = !empty($classStack);
    $classTopBraceLevel = $inClass ? $classStack[count($classStack) - 1]['braceLevel'] : null;
    $atClassTopLevel = $inClass && $braceLevel === $classTopBraceLevel;

    $isClassDecl = $id === T_CLASS || $id === T_INTERFACE || $id === T_TRAIT;
    if ($isClassDecl) {
      $prevIdx = prevNonIgnorableIndex($tokens, $i - 1);
      $prevId = $prevIdx >= 0 ? tokenId($tokens[$prevIdx]) : null;
      if ($prevId === T_DOUBLE_COLON) {
        continue; // Foo::class
      }

      $kind = $id === T_INTERFACE ? 'interface' : ($id === T_TRAIT ? 'trait' : 'class');
      $nameIdx = nextNonIgnorableIndex($tokens, $i + 1);
      if ($nameIdx < 0) continue;
      $nameTok = $tokens[$nameIdx];
      if (tokenId($nameTok) !== T_STRING) continue;
      $name = tokenText($nameTok);

      $extends = [];
      $implements = [];

      // Parse extends/implements between name and the class opening brace.
      for ($j = $nameIdx + 1; $j < $count; $j++) {
        $jt = $tokens[$j];
        $jid = tokenId($jt);
        $jtx = tokenText($jt);
        if ($jtx === '{') {
          break;
        }
        if ($jid === T_EXTENDS) {
          $j++;
          if ($kind === 'interface') {
            while ($j < $count) {
              [$n, $j] = readQualifiedName($tokens, $j);
              if ($n !== '') $extends[] = ltrim($n, '\\');
              while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
              if ($j >= $count || tokenText($tokens[$j]) !== ',') break;
              $j++; // comma
            }
          } else {
            [$n, $j] = readQualifiedName($tokens, $j);
            if ($n !== '') $extends[] = ltrim($n, '\\');
          }
          continue;
        }
        if ($jid === T_IMPLEMENTS) {
          $j++;
          while ($j < $count) {
            [$n, $j] = readQualifiedName($tokens, $j);
            if ($n !== '') $implements[] = ltrim($n, '\\');
            while ($j < $count && isIgnorableToken($tokens[$j])) $j++;
            if ($j >= $count || tokenText($tokens[$j]) !== ',') break;
            $j++; // comma
          }
          continue;
        }
      }

      $fqcn = $namespace !== '' ? ($namespace . '\\' . $name) : $name;
      $line = tokenLine($tok);
      $doc = null;
      if ($lastDoc && ($line - $lastDoc['endLine']) <= 2) {
        $doc = $lastDoc['text'];
      }
      $lastDoc = null;

      $classes[] = [
        'kind' => $kind,
        'name' => $name,
        'fqcn' => $fqcn,
        'namespace' => $namespace,
        'extends' => $extends,
        'implements' => $implements,
        'file' => relativePath($filePath, $root),
        'line' => $line,
        'docblock' => $doc,
        'methods' => [],
        'properties' => [],
        'constants' => [],
      ];

      $pendingClassIndex = count($classes) - 1;
      continue;
    }

    // Property detection: public|protected|private [static] [readonly] [?Type] $name
    if ($atClassTopLevel && ($id === T_PUBLIC || $id === T_PROTECTED || $id === T_PRIVATE || $id === T_VAR)) {
      // Look ahead to check if this is a property (not a function)
      $propStartIdx = $i;
      $visibility = 'public';
      if ($id === T_PRIVATE) $visibility = 'private';
      if ($id === T_PROTECTED) $visibility = 'protected';

      $static = false;
      $readonly = false;
      $propType = '';
      $propName = null;
      $propDefault = null;

      $j = $i + 1;
      while ($j < $count) {
        $jt = $tokens[$j];
        $jid = tokenId($jt);
        $jtx = tokenText($jt);

        // Skip whitespace and comments
        if ($jid === T_WHITESPACE || $jid === T_COMMENT) {
          $j++;
          continue;
        }

        // Check for modifiers
        if ($jid === T_STATIC) {
          $static = true;
          $j++;
          continue;
        }
        if (defined('T_READONLY') && $jid === T_READONLY) {
          $readonly = true;
          $j++;
          continue;
        }
        if ($jid === T_PUBLIC || $jid === T_PROTECTED || $jid === T_PRIVATE) {
          if ($jid === T_PRIVATE) $visibility = 'private';
          if ($jid === T_PROTECTED) $visibility = 'protected';
          if ($jid === T_PUBLIC) $visibility = 'public';
          $j++;
          continue;
        }

        // If we hit T_FUNCTION, this is a method not a property
        if ($jid === T_FUNCTION) {
          break;
        }

        // If we hit T_CONST, skip
        if ($jid === T_CONST) {
          break;
        }

        // Type hint (nullable or regular)
        if ($jtx === '?') {
          $propType = '?';
          $j++;
          continue;
        }
        if (isNameToken($jt)) {
          [$typeName, $j] = readQualifiedName($tokens, $j);
          $propType .= $typeName;
          continue;
        }

        // Variable name
        if ($jid === T_VARIABLE) {
          $propName = $jtx;
          $j++;

          // Look for default value
          while ($j < $count) {
            $dt = $tokens[$j];
            $did = tokenId($dt);
            $dtx = tokenText($dt);

            if ($did === T_WHITESPACE || $did === T_COMMENT) {
              $j++;
              continue;
            }

            if ($dtx === '=') {
              $j++;
              $defaultParts = '';
              $parenDepth = 0;
              $bracketDepth = 0;
              while ($j < $count) {
                $vt = $tokens[$j];
                $vtx = tokenText($vt);
                if ($vtx === '(') $parenDepth++;
                if ($vtx === ')') $parenDepth--;
                if ($vtx === '[') $bracketDepth++;
                if ($vtx === ']') $bracketDepth--;
                if (($vtx === ';' || $vtx === ',') && $parenDepth === 0 && $bracketDepth === 0) break;
                $defaultParts .= $vtx;
                $j++;
              }
              $propDefault = trim($defaultParts);
              break;
            }

            if ($dtx === ';' || $dtx === ',') {
              break;
            }

            $j++;
          }
          break;
        }

        // Anything else, break out
        break;
      }

      // If we found a property name, record it
      if ($propName !== null) {
        $classIndex = $classStack[count($classStack) - 1]['index'];
        $line = tokenLine($tok);
        $doc = null;
        if ($lastDoc && ($line - $lastDoc['endLine']) <= 2) {
          $doc = $lastDoc['text'];
        }
        $lastDoc = null;

        $classes[$classIndex]['properties'][] = [
          'name' => ltrim($propName, '$'),
          'visibility' => $visibility,
          'static' => $static,
          'readonly' => $readonly,
          'type' => $propType,
          'default' => $propDefault,
          'line' => $line,
          'docblock' => $doc,
          'file' => relativePath($filePath, $root),
        ];

        $i = $j - 1;
        continue;
      }
    }

    if ($id === T_FUNCTION) {
      $nameIdx = nextNonIgnorableIndex($tokens, $i + 1);
      if ($nameIdx < 0) continue;

      // Handle reference: function &name(...)
      $nameTok = $tokens[$nameIdx];
      if (tokenText($nameTok) === '&') {
        $nameIdx = nextNonIgnorableIndex($tokens, $nameIdx + 1);
        if ($nameIdx < 0) continue;
        $nameTok = $tokens[$nameIdx];
      }

      $nameId = tokenId($nameTok);
      if ($nameId !== T_STRING) {
        continue; // anonymous function/closure
      }
      $name = tokenText($nameTok);

      $line = tokenLine($tok);
      $doc = null;
      if ($lastDoc && ($line - $lastDoc['endLine']) <= 2) {
        $doc = $lastDoc['text'];
      }
      $lastDoc = null;

      // Find declaration start (modifiers) for signature reconstruction
      $startIdx = $i;
      $k = $i - 1;
      while ($k >= 0) {
        $kt = $tokens[$k];
        $kid = tokenId($kt);
        $ktx = tokenText($kt);
        if ($kid === T_WHITESPACE || $kid === T_COMMENT) {
          $k--;
          continue;
        }
        if (in_array($kid, [T_PUBLIC, T_PROTECTED, T_PRIVATE, T_STATIC, T_ABSTRACT, T_FINAL, T_VAR], true)) {
          $startIdx = $k;
          $k--;
          continue;
        }
        if ($ktx === '#' || ($kid !== null && defined('T_ATTRIBUTE') && $kid === T_ATTRIBUTE)) {
          $startIdx = $k;
          $k--;
          continue;
        }
        break;
      }

      // Find signature end (before body { ... } or ; )
      $endIdx = $i;
      for ($j = $i; $j < $count; $j++) {
        $jt = $tokens[$j];
        $jtx = tokenText($jt);
        if ($jtx === '{' || $jtx === ';') {
          $endIdx = $j;
          break;
        }
      }

      $sigParts = '';
      for ($j = $startIdx; $j < $endIdx; $j++) {
        $sigParts .= tokenText($tokens[$j]);
      }
      $signature = normalizeSignature($sigParts);

      if ($inClass && $atClassTopLevel) {
        $classIndex = $classStack[count($classStack) - 1]['index'];

        $visibility = 'public';
        $static = false;
        $abstract = false;
        $final = false;
        for ($j = $startIdx; $j < $i; $j++) {
          $mid = tokenId($tokens[$j]);
          if ($mid === T_PRIVATE) $visibility = 'private';
          if ($mid === T_PROTECTED) $visibility = 'protected';
          if ($mid === T_PUBLIC) $visibility = 'public';
          if ($mid === T_STATIC) $static = true;
          if ($mid === T_ABSTRACT) $abstract = true;
          if ($mid === T_FINAL) $final = true;
        }

        $classes[$classIndex]['methods'][] = [
          'name' => $name,
          'visibility' => $visibility,
          'static' => $static,
          'abstract' => $abstract,
          'final' => $final,
          'signature' => $signature,
          'line' => $line,
          'docblock' => $doc,
          'file' => relativePath($filePath, $root),
        ];
        continue;
      }

      if (!$inClass) {
        $fqfn = $namespace !== '' ? ($namespace . '\\' . $name) : $name;
        $functions[] = [
          'name' => $name,
          'fqfn' => $fqfn,
          'namespace' => $namespace,
          'signature' => $signature,
          'line' => $line,
          'docblock' => $doc,
          'file' => relativePath($filePath, $root),
        ];
        continue;
      }
    }
  }

  return ['classes' => $classes, 'functions' => $functions];
}

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

$result = [
  'root' => str_replace(DIRECTORY_SEPARATOR, '/', realpath($root) ?: $root),
  'classes' => [],
  'functions' => [],
];

$dirIter = new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS);
$iter = new RecursiveIteratorIterator($dirIter);

foreach ($iter as $fileInfo) {
  /** @var SplFileInfo $fileInfo */
  if (!$fileInfo->isFile()) continue;
  $path = $fileInfo->getPathname();
  if (!str_ends_with(strtolower($path), '.php')) continue;

  $rel = relativePath($path, $root);
  if (startsWithAnySegment($rel, $ignoreDirs)) continue;

  $symbols = extractSymbolsFromFile($path, $root);
  if (!empty($symbols['classes'])) {
    $result['classes'] = array_merge($result['classes'], $symbols['classes']);
  }
  if (!empty($symbols['functions'])) {
    $result['functions'] = array_merge($result['functions'], $symbols['functions']);
  }
}

echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
