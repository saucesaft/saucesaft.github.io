const eleventyNavigationPlugin = require("@11ty/eleventy-navigation");
const markdownIt = require('markdown-it');
const markdownItOptions = {
    html: true,
    linkify: true
};
const inspect = require("node:util").inspect;

module.exports = function(eleventyConfig) {

  eleventyConfig.addPassthroughCopy('css')
  eleventyConfig.addPassthroughCopy('fonts')
  eleventyConfig.addPassthroughCopy('img')
  eleventyConfig.addPassthroughCopy('garden/**/img/*')

  const md = markdownIt(markdownItOptions)
  .use(require('markdown-it-attrs'));


  // filter to adapt obsidian's image url's into eleventy compatible ones
  eleventyConfig.addFilter("wikimage", string => {
    string = string.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
      const parts = s.slice(3,-2).split("|");

      return md.renderInline(`![${parts[1]}](../img/${parts[0].trim()}){.center-post}`)
    })
    return string
  })

  eleventyConfig.addFilter("getRandom", function(items) {
    let selected = items[Math.floor(Math.random() * items.length)];
    return selected;
  });

  eleventyConfig.addFilter("inspect", function (obj = {}) {
    return inspect(obj, {sorted: true});
  });

  eleventyConfig.setLibrary('md', md);

  eleventyConfig.addPlugin(eleventyNavigationPlugin);

  return {
    passthroughFileCopy: true,
    dir: {
	input: ".",
	includes: "_includes",
	data: "_data",
	output: "docs"
	}
  }

}
