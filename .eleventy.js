const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginAncestry = require("@tigersway/eleventy-plugin-ancestry");

// var prism = require('prismjs');
// require("prismjs/plugins/filter-highlight-all/prism-filter-highlight-all.min");
// require('prismjs/plugins/keep-markup/prism-keep-markup.js');

const wikiModule = require('./.wiki.js');

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

  // generate randomnes as a filter for the phrases on top
  eleventyConfig.addFilter("getRandom", function(items) {
    let selected = items[Math.floor(Math.random() * items.length)];
    return selected;
  });

  // inspecting js elements, required when debugging
  eleventyConfig.addFilter("inspect", function (obj = {}) {
    return inspect(obj, {sorted: true});
  });

  // set the exceprt cut tag
  // TODO make it automatic
  eleventyConfig.setFrontMatterParsingOptions({
      excerpt: true,
      excerpt_separator: "<!-- more -->",
  });

  // apply wiki functionality from the imported module
  wikiModule(eleventyConfig, md);

  // Read all directories inside the wiki folder
  const wikiFolder = './content/wiki';
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

  /* tag filters */
  // get unique values from an array
  eleventyConfig.addFilter("unique", function(array) {
    return [...new Set(array)];
  });

  // slice an array
  eleventyConfig.addFilter("slice", function(array, start, end) {
    return array.slice(start, end);
  });

  // filter collection items by a specific property path
  eleventyConfig.addFilter("filterCollectionItems", function(collection, property, value) {
    return collection.filter(item => {
      const propertyValue = property.split('.').reduce((obj, prop) => 
        obj && obj[prop] !== undefined ? obj[prop] : undefined, item);
      return propertyValue && propertyValue.includes(value);
    });
  });

  // filter by tag
  eleventyConfig.addFilter("filterByTag", function(collection, tag) {
    return collection.filter(item => {
      return item.data.tags && item.data.tags.includes(tag);
    });
  });

  // date display filter
  eleventyConfig.addFilter("dateDisplay", function(date) {
    return date ? new Date(date).toLocaleDateString("en-US", {
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    }) : '';
  });

  // slugify a string for use in URLs
  eleventyConfig.addFilter("slugify", function(str) {
    return str
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-')     // replace spaces with -
      .replace(/[^\w\-]+/g, '') // remove all non-word chars
      .replace(/\-\-+/g, '-')   // replace multiple - with single -
      .replace(/^-+/, '')       // trim - from start of text
      .replace(/-+$/, '');      // trim - from end of text
  });

  // create a collection with all tags from brain posts
  eleventyConfig.addCollection("tagList", function(collection) {
    // get all unique tags from brain posts
    const tagsSet = new Set();
    
    collection.getAll().forEach(item => {
      if (!item.data.tags || !item.filePathStem.startsWith('/content/brain/')) return;
      
      item.data.tags
        .filter(tag => !["posts", "all", "brain"].includes(tag))
        .forEach(tag => tagsSet.add(tag));
    });
    
    return [...tagsSet].sort();
  });

  // folders of things we want in the final output
  eleventyConfig.addPassthroughCopy('css')
  eleventyConfig.addPassthroughCopy('fonts')
  eleventyConfig.addPassthroughCopy('img')
  eleventyConfig.addPassthroughCopy('content/**/img/*')
  eleventyConfig.addPassthroughCopy({
    CNAME: 'CNAME'
  });  

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
