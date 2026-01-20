/**
 * Remove empty markdown sections (headings with no content).
 *
 * @since $ver$
 *
 * @return {(tree: any) => void} Transformer function.
 */
export default function remarkRemoveEmptySections() {
  return ( tree ) => {
    /**
     * Check if a node should be treated as empty content.
     * @param {object} node
     * @returns {boolean}
     */
    const is_ignorable_node = ( node ) => {
      if ( ! node || 'object' !== typeof node ) {
        return true;
      }

      if ( 'paragraph' === node.type ) {
        return ( node.children || [] )
          .every( ( child ) => 'text' === child.type && /^\s*$/.test( child.value || '' ) );
      }

      if ( 'text' === node.type ) {
        return /^\s*$/.test( node.value || '' );
      }

      if ( 'html' === node.type ) {
        return /^\s*$/.test( node.value || '' );
      }

      return false;
    };

    /**
     * Remove empty heading sections from a node list.
     * @param {Array<object>} nodes
     * @returns {Array<object>}
     */
    const prune_nodes = ( nodes ) => {
      const result = [];
      let index = 0;

      while ( index < nodes.length ) {
        const node = nodes[ index ];

        if ( node && 'heading' === node.type && ( node.depth || 0 ) >= 2 ) {
          let nextIndex = index + 1;

          while ( nextIndex < nodes.length ) {
            const nextNode = nodes[ nextIndex ];
            if ( nextNode && 'heading' === nextNode.type && ( nextNode.depth || 0 ) <= node.depth ) {
              break;
            }
            nextIndex += 1;
          }

          const sectionNodes = nodes.slice( index + 1, nextIndex );
          const hasContent = sectionNodes.some( ( child ) => ! is_ignorable_node( child ) );

          if ( ! hasContent ) {
            index = nextIndex;
            continue;
          }
        }

        result.push( node );
        index += 1;
      }

      return result;
    };

    /**
     * Walk the AST and prune empty sections in place.
     * @param {object} node
     * @returns {void}
     */
    const visit_node = ( node ) => {
      if ( ! node || 'object' !== typeof node ) {
        return;
      }

      if ( Array.isArray( node.children ) ) {
        node.children = prune_nodes( node.children );
        node.children.forEach( visit_node );
      }
    };

    visit_node( tree );
  };
}
