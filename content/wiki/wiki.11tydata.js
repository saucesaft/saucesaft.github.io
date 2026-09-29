// defaults for every note in this folder, so obsidian notes need no boilerplate
module.exports = {
  layout: "layouts/post.njk",
  eleventyComputed: {
    // obsidian's inline title is the file name, so that is the post title
    // unless the note sets its own `title:` in the front matter
    title: data => data.title || data.page.fileSlug,
  },
};
