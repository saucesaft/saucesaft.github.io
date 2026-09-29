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

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = 'content';
const ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|mp4|webm|pdf)$/i;
// vault folders that never ship (obsidian config, note templates)
const SKIP_DIRS = new Set(['.obsidian', '.trash', '_templates']);

// every attachment in the vault, as { src: 'content/brain/img/x.png', url: '/brain/img/x.png' }.
// the url mirrors the note's own folder, so plain relative markdown links
// (![](img/x.png)) written by obsidian keep working on the built site too
function findAttachments(dir = CONTENT_DIR, found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (SKIP_DIRS.has(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findAttachments(full, found);
    if (!ATTACHMENT_EXT.test(entry.name)) return;
    const rel = path.relative(CONTENT_DIR, full).split(path.sep).join('/');
    found.push({ src: full, url: '/' + rel });
  });
  return found;
}

// resolve ![[name.png]] the way obsidian does: by file name anywhere in the vault,
// or by partial path (![[galaxies/img/x.png]]) when names collide. ties go to the
// attachment closest to the citing note.
function resolveAttachment(ref, attachments, page) {
  const target = ref.trim().replace(/^\.?\//, '');
  const candidates = attachments.filter(a => a.url === '/' + target || a.url.endsWith('/' + target));
  if (candidates.length <= 1) return candidates[0];

  const noteDir = page && page.inputPath
    ? '/' + path.posix.dirname(page.inputPath.replace(/^\.\/content\//, ''))
    : '';
  const shared = a => {
    let n = 0;
    while (n < a.url.length && a.url[n] === noteDir[n]) n++;
    return n;
  };
  return candidates.sort((a, b) => shared(b) - shared(a))[0];
}

// ![[file|alias|300]] -> image. numeric parts are obsidian sizes (300 or 300x200),
// anything else is the alt text / caption
function renderEmbed(inner, attachments, page, md) {
  const [ref, ...rest] = inner.split('|').map(s => s.trim());
  let alt = ref, width = null, height = null;
  rest.forEach(part => {
    const size = part.match(/^(\d+)(?:x(\d+))?$/);
    if (size) { width = size[1]; height = size[2] || null; }
    else if (part) alt = part;
  });

  const found = resolveAttachment(ref, attachments, page);
  if (!found) {
    console.warn(`[wikimage] "${ref}" referenced from ${page && page.inputPath} was not found in the vault`);
  }
  const url = found ? found.url : ref;
  const src = encodeURI(url);

  if (/\.(mp4|webm)$/i.test(ref)) {
    return `<video src="${src}" controls class="center-post"${width ? ` width="${width}"` : ''}></video>`;
  }
  if (/\.pdf$/i.test(ref)) {
    return `<a href="${src}">${md.utils.escapeHtml(alt)}</a>`;
  }
  const attrs = ['.center-post'];
  if (width) attrs.push(`width=${width}`);
  if (height) attrs.push(`height=${height}`);
  return md.renderInline(`![${alt}](${src}){${attrs.join(' ')}}`);
}

const EMBED_REGEX = /!\[\[(?!.+?:)([^\]\[]+)\]\]/gm;

module.exports = function(eleventyConfig, md) {
    const attachments = findAttachments();

    // ship every vault attachment next to the note it belongs to
    // (content/brain/img/x.png -> /brain/img/x.png)
    attachments.forEach(a => {
      eleventyConfig.addPassthroughCopy({ [a.src]: a.url.slice(1) });
    });

    // filter to adapt obsidian's image embeds into eleventy compatible ones
    eleventyConfig.addFilter("wikimage", function(string, page) {
      return string.replaceAll(EMBED_REGEX, (s, inner) => renderEmbed(inner, attachments, page || this.page, md));
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
      let processed = content.replaceAll(EMBED_REGEX, (s, inner) => renderEmbed(inner, attachments, page, md));

      // then apply wikilinks filter - passing the page object and the full page index
      return eleventyConfig.getFilter("wikilinks")(processed, page, allPages);
    });
  };

// shared with the seo data (social card image lookup)
module.exports.findAttachments = findAttachments;
module.exports.resolveAttachment = resolveAttachment;
