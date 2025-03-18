// .wiki.js - Wiki functionality module for your Eleventy site

module.exports = function(eleventyConfig, md) {
    // filter to adapt obsidian's image url's into eleventy compatible ones
    eleventyConfig.addFilter("wikimage", function(string) {
      string = string.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
        const parts = s.slice(3,-2).split("|");
        return md.renderInline(`![${parts[1] || parts[0]}](../img/${parts[0].trim()}){.center-post}`)
      });
      return string;
    });
  
    // filter to transform wiki-style links [[pagename]] to HTML links with section awareness
    eleventyConfig.addFilter("wikilinks", function(content, page) {
      // this regex matches [[pagename]], [[pagename|Display Text]], and [[section:pagename|Display Text]]
      const wikilinkRegex = /\[\[([^:\]\|]+)?(?::([^\]\|]+))?(\|([^\]]+))?\]\]/g;
      
      return content.replace(wikilinkRegex, function(match, section, pageName, _, displayText) {
        // if pageName is undefined, it means we have [[pagename]] format without a colon
        // in this case, move the section (which is actually the page name) to pageName
        if (!pageName) {
          pageName = section;
          
          // determine section from the current page's inputPath
          if (page && page.inputPath) {
            const inputPathMatch = page.inputPath.match(/\/content\/([^\/]+)\//);
            section = inputPathMatch ? inputPathMatch[1] : 'wiki'; // default to wiki if can't determine
          } else {
            section = 'wiki'; // default section if we can't determine from page
          }
        }
        
        // clean up the page name and create a slug
        const slug = pageName.trim()
          .toLowerCase()
          .replace(/\s+/g, '-')     // replace spaces with hyphens
          .replace(/[^\w\-]+/g, '') // remove non-word chars
          .replace(/\-\-+/g, '-')   // replace multiple hyphens with single hyphen
          .replace(/^-+/, '')       // trim hyphens from start
          .replace(/-+$/, '');      // trim hyphens from end
        
        // use display text if provided, otherwise use the page name
        const linkText = displayText ? displayText.trim() : pageName.trim();
        
        // generate the HTML link with the appropriate section
        return `<a href="/${section}/${slug}.html" class="wikilink wikilink-${section}">${linkText}</a>`;
      });
    });
  
    // add a combined filter that applies both wikimage and wikilinks
    eleventyConfig.addFilter("wikitransform", function(content, page) {
      // first apply wikimage filter
      let processed = content.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
        const parts = s.slice(3,-2).split("|");
        return md.renderInline(`![${parts[1] || parts[0]}](../img/${parts[0].trim()}){.center-post}`)
      });
      
      // then apply wikilinks filter - passing the page object
      return eleventyConfig.getFilter("wikilinks")(processed, page);
    });
  };