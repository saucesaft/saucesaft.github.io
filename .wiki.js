// .wiki.js - Wiki functionality module for your Eleventy site

// normalize a page name / title into the same key style used for lookups,
// independent of eleventy's own fileSlug so authoring stays forgiving
// (spaces, punctuation, casing all collapse to the same key)
function normalizeSlug(str) {
  return (str || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// build a lookup of every citable page (anything under content/<section>/...),
// keyed by both its fileSlug and its title, so [[pagename]] resolves to the
// page's *real* url regardless of nesting (project subfolders, index pages, etc)
function buildWikiIndex(allPages) {
  const index = {};

  (allPages || []).forEach(item => {
    if (!item || !item.inputPath || !item.url) return;

    const sectionMatch = item.inputPath.match(/\/content\/([^\/]+)\//);
    if (!sectionMatch) return; // top-level content files (tags, index, etc) aren't citable targets
    const section = sectionMatch[1];

    const fileSlug = item.fileSlug || (item.data && item.data.page && item.data.page.fileSlug);
    const keys = new Set();
    if (fileSlug) keys.add(normalizeSlug(fileSlug));
    if (item.data && item.data.title) keys.add(normalizeSlug(item.data.title));

    keys.forEach(key => {
      if (!key) return;
      if (!index[key]) index[key] = [];
      index[key].push({ url: item.url, section, title: item.data && item.data.title });
    });
  });

  return index;
}

module.exports = function(eleventyConfig, md) {
    // filter to adapt obsidian's image url's into eleventy compatible ones
    eleventyConfig.addFilter("wikimage", function(string) {
      string = string.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
        const parts = s.slice(3,-2).split("|");
        return md.renderInline(`![${parts[1] || parts[0]}](../img/${parts[0].trim()}){.center-post}`)
      });
      return string;
    });

    // filter to transform wiki-style links [[pagename]] to HTML links, resolved
    // against every real page on the site (not guessed) so brain <-> wiki citation
    // works across sections and across nested project folders.
    // supports [[pagename]], [[pagename|Display Text]], and [[section:pagename|Display Text]]
    eleventyConfig.addFilter("wikilinks", function(content, page, allPages) {
      const wikilinkRegex = /\[\[([^:\]\|]+)?(?::([^\]\|]+))?(\|([^\]]+))?\]\]/g;
      const index = buildWikiIndex(allPages);

      const currentSectionMatch = page && page.inputPath && page.inputPath.match(/\/content\/([^\/]+)\//);
      const currentSection = currentSectionMatch ? currentSectionMatch[1] : null;

      return content.replace(wikilinkRegex, function(match, section, pageName, _, displayText) {
        let explicitSection = null;

        // [[pagename]] form: no colon, so the first group is actually the page name
        if (!pageName) {
          pageName = section;
        } else {
          // [[section:pagename]] form: first group is an explicit section to search in
          explicitSection = section;
        }

        const linkText = displayText ? displayText.trim() : pageName.trim();
        const key = normalizeSlug(pageName);

        let candidates = index[key] || [];
        if (explicitSection) {
          candidates = candidates.filter(c => c.section === explicitSection);
        }

        let target = null;
        if (candidates.length === 1) {
          target = candidates[0];
        } else if (candidates.length > 1) {
          // ambiguous: prefer a match in the citing page's own section, else first match
          target = candidates.find(c => c.section === currentSection) || candidates[0];
          console.warn(`[wikilinks] "${pageName.trim()}" is ambiguous (found in: ${candidates.map(c => c.section).join(', ')}), linking to ${target.section}. Use [[${target.section}:${pageName.trim()}]] to disambiguate.`);
        }

        if (!target) {
          console.warn(`[wikilinks] "${pageName.trim()}"${explicitSection ? ` (section: ${explicitSection})` : ''} referenced from ${page && page.inputPath} does not match any page`);
          return `<span class="wikilink not-found" title="page not found: ${pageName.trim()}">${linkText}</span>`;
        }

        return `<a href="${target.url}" class="wikilink wikilink-${target.section}">${linkText}</a>`;
      });
    });

    // add a combined filter that applies both wikimage and wikilinks
    eleventyConfig.addFilter("wikitransform", function(content, page, allPages) {
      // first apply wikimage filter
      let processed = content.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
        const parts = s.slice(3,-2).split("|");
        return md.renderInline(`![${parts[1] || parts[0]}](../img/${parts[0].trim()}){.center-post}`)
      });

      // then apply wikilinks filter - passing the page object and the full page index
      return eleventyConfig.getFilter("wikilinks")(processed, page, allPages);
    });
  };
