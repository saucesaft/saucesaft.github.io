// .wiki.js - Wiki functionality module for your Eleventy site

module.exports = function(eleventyConfig, md) {
    // filter to transform Obsidian-style image links ![[image.png]] to HTML img tags
    eleventyConfig.addFilter("wikimage", function(string) {
      string = string.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
        const parts = s.slice(3,-2).split("|");
        return md.renderInline(`![${parts[1] || parts[0]}](../img/${parts[0].trim()}){.center-post}`)
      });
      return string;
    });
  
    // filter to transform wiki-style links [[pagename]] to HTML links
    eleventyConfig.addFilter("wikilinks", function(content) {
      // this regex matches [[pagename]] or [[pagename|Display Text]]
      const wikilinkRegex = /\[\[([^\]\|]+)(\|([^\]]+))?\]\]/g;
      
      return content.replace(wikilinkRegex, function(match, pageName, _, displayText) {
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
        
        // generate the HTML link - adapt the path structure as needed for your site
        return `<a href="/wiki/${slug}" class="wikilink">${linkText}</a>`;
      });
    });
  
    // add a combined filter that applies both wikimage and wikilinks
    eleventyConfig.addFilter("wikitransform", function(content) {
      // First apply wikimage filter
      let processed = content.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
        const parts = s.slice(3,-2).split("|");
        return md.renderInline(`![${parts[1] || parts[0]}](../img/${parts[0].trim()}){.center-post}`)
      });
      
      // then apply wikilinks filter
      processed = processed.replace(/\[\[([^\]\|]+)(\|([^\]]+))?\]\]/g, function(match, pageName, _, displayText) {
        // clean up the page name and create a slug
        const slug = pageName.trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
        
        // use display text if provided, otherwise use the page name
        const linkText = displayText ? displayText.trim() : pageName.trim();
        
        // generate the HTML link
        return `<a href="/wiki/${slug}" class="wikilink">${linkText}</a>`;
      });
      
      return processed;
    });
  };