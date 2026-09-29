// drafts: `draft: true` in a note's front matter keeps it off the built site
// (no page, not in any list or tag page). `bun run dev` still shows them so
// they can be previewed locally.
const showDrafts = process.env.SHOW_DRAFTS === '1';
const hidden = data => data.draft && !showDrafts;

module.exports = {
  eleventyComputed: {
    permalink: data => (hidden(data) ? false : data.permalink),
    eleventyExcludeFromCollections: data => (hidden(data) ? true : data.eleventyExcludeFromCollections),
  },
};
