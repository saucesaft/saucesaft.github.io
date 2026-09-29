// drafts: `draft: true` in a note's front matter keeps it off the built site
// (no page, not in any list or tag page). the local dev server (--serve or
// --watch) still shows them for previewing; SHOW_DRAFTS=1 forces them on.
const showDrafts = process.argv.some(arg => arg === '--serve' || arg === '--watch')
  || process.env.SHOW_DRAFTS === '1';
const hidden = data => data.draft && !showDrafts;

module.exports = {
  eleventyComputed: {
    permalink: data => (hidden(data) ? false : data.permalink),
    eleventyExcludeFromCollections: data => (hidden(data) ? true : data.eleventyExcludeFromCollections),
  },
};
