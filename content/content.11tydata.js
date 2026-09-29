const fs = require('fs');
const { findAttachments, resolveAttachment } = require('../.wiki.js');

// drafts: `draft: true` in a note's front matter keeps it off the built site
// (no page, not in any list, tag page, feed or sitemap). the local dev server
// (--serve or --watch) still shows them for previewing; SHOW_DRAFTS=1 forces them on.
const showDrafts = process.argv.some(arg => arg === '--serve' || arg === '--watch')
  || process.env.SHOW_DRAFTS === '1';
const hidden = data => data.draft && !showDrafts;

// a real post: a markdown note in brain/ or wiki/, not a section index page
const isPost = data => /^\.\/content\/(brain|wiki)\/.+\.md$/.test(data.page.inputPath)
  && !data.page.inputPath.endsWith('/index.md');

// raw markdown body of a note, without its front matter
function readBody(inputPath) {
  if (!inputPath.endsWith('.md')) return '';
  try {
    return fs.readFileSync(inputPath, 'utf8').replace(/^---\n[\s\S]*?\n---\n?/, '');
  } catch (e) {
    return '';
  }
}

// markdown -> one line of plain text, for descriptions and link previews
function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[(?:[^\]|]*:)?([^\]|]*)(?:\|([^\]]*))?\]\]/g, (m, page, text) => text || page)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\{[.#][^}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// true when the note sets `date:` itself. without it eleventy falls back to the
// file's creation time, which on CI is the deploy time, so it's not a real date
function hasFrontMatterDate(inputPath) {
  try {
    const frontMatter = fs.readFileSync(inputPath, 'utf8').match(/^---\n([\s\S]*?)\n---/);
    return !!frontMatter && /^date:\s*\S/m.test(frontMatter[1]);
  } catch (e) {
    return false;
  }
}

function truncate(text, max = 160) {
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(' ', max - 1)).replace(/[,.;:]$/, '') + '…';
}

let attachments;

module.exports = {
  eleventyComputed: {
    permalink: data => (hidden(data) ? false : data.permalink),
    eleventyExcludeFromCollections: data => (hidden(data) ? true : data.eleventyExcludeFromCollections),

    isPost: data => isPost(data),
    hasDate: data => hasFrontMatterDate(data.page.inputPath),

    // search snippet / link preview text: front matter `description`, else the
    // excerpt above <!-- more -->, else the start of the note
    description: data => {
      if (data.description) return data.description;
      if (!isPost(data)) return undefined;
      const body = readBody(data.page.inputPath);
      const intro = body.includes('<!-- more -->') ? body.split('<!-- more -->')[0] : body;
      return truncate(plainText(intro)) || undefined;
    },

    // link preview image: front matter `image`, else the first image in the note
    socialImage: data => {
      if (!isPost(data)) return data.image;
      let ref = data.image;
      if (!ref) {
        const body = readBody(data.page.inputPath);
        const embed = body.match(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp))[^\]]*\]\]/i);
        const link = body.match(/!\[[^\]]*\]\(([^)\s]+\.(?:png|jpe?g|gif|webp))\)/i);
        ref = embed ? embed[1] : link && link[1];
      }
      if (!ref) return undefined;
      if (/^(https?:)?\//.test(ref)) return ref;
      attachments = attachments || findAttachments();
      const found = resolveAttachment(ref.split('/').pop(), attachments, data.page);
      return found && found.url;
    },
  },
};
