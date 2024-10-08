const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginAncestry = require("@tigersway/eleventy-plugin-ancestry");

// var prism = require('prismjs');
// require("prismjs/plugins/filter-highlight-all/prism-filter-highlight-all.min");
// require('prismjs/plugins/keep-markup/prism-keep-markup.js');

const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const tmp = require('tmp');

var fs = require('fs');
const path = require('path');

const { spawnSync } = require('child_process');

const markdownIt = require('markdown-it');
const markdownItOptions = {
    html: true,
    linkify: true
};
const inspect = require("node:util").inspect;

module.exports = function(eleventyConfig) {

  // custom markdown-it instance
  const md = markdownIt(markdownItOptions)
    .use(require('markdown-it-attrs'));

  // inline code syntax highlighting
  md.renderer.rules.code_inline = (tokens, idx, { langPrefix = '' }) => {
    const token = tokens[idx];
    return `<code class="${langPrefix}">${token.content}</code>`;
  };

  // filter to adapt obsidian's image url's into eleventy compatible ones
  eleventyConfig.addFilter("wikimage", string => {
    string = string.replaceAll(/!\[\[(?!.+?:)([^\]\[]+)\]\]/gm, function(s) {
      const parts = s.slice(3,-2).split("|");

      return md.renderInline(`![${parts[1]}](../img/${parts[0].trim()}){.center-post}`)
    })
    return string
  })

  // generate randomnes as a filter for the phrases on top
  eleventyConfig.addFilter("getRandom", function(items) {
    let selected = items[Math.floor(Math.random() * items.length)];
    return selected;
  });

  // inspecting js elements, required when debugging
  eleventyConfig.addFilter("inspect", function (obj = {}) {
    return inspect(obj, {sorted: true});
  });


  const wikiFolder = './content/wiki';

  // Read all directories inside the wiki folder
  const subfolders = fs.readdirSync(wikiFolder).filter(file => {
    return fs.statSync(path.join(wikiFolder, file)).isDirectory();
  });

  // Create a collection for each subfolder in wiki
  subfolders.forEach(folder => {
    eleventyConfig.addCollection(folder, function(collection) {
      return collection.getAllSorted()
        .filter(item => item.inputPath.startsWith(`${wikiFolder}/${folder}/`))
        .sort((a, b) => a.data.position - b.data.position);
    });
  });


  // filter to have all content inside of another folder, not on root,
  // read content/content.json to see when it is used
  eleventyConfig.addFilter("dropContentFolder", function (path) {
    const pathToDrop = "/content"
    if (path.indexOf(pathToDrop) !== 0) {
      return path
    }
    return path.slice(pathToDrop.length)
  });

  // folders of things we want in the final output
  eleventyConfig.addPassthroughCopy('css')
  eleventyConfig.addPassthroughCopy('fonts')
  eleventyConfig.addPassthroughCopy('img')
  eleventyConfig.addPassthroughCopy('content/**/img/*')

  // add extra plugins
  eleventyConfig.setLibrary('md', md);
  eleventyConfig.addPlugin(pluginAncestry);
  eleventyConfig.addPlugin(syntaxHighlight, {
    init: function({ Prism }) {
      Prism.languages.tikz = Prism.languages.markup;
    },
  });

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
