/**
 * Strip a leading "./src/" from inline code paths.
 *
 * This lets us render paths like "./src/includes/file.php" as "./includes/file.php".
 *
 * @since $ver$
 *
 * @return {(tree: any) => void} Transformer function.
 */
export default function remarkStripLeadingSrcPath() {
  return (tree) => {
    const visit_node = (node) => {
      if ( ! node || 'object' !== typeof node ) {
        return;
      }

      if ( 'inlineCode' === node.type || 'code' === node.type ) {
        if ( 'string' === typeof node.value && node.value.startsWith( './src/' ) ) {
          node.value = `./${ node.value.slice( './src/'.length ) }`;
        }
      }

      if ( Array.isArray( node.children ) ) {
        node.children.forEach( visit_node );
      }
    };

    visit_node( tree );
  };
}
