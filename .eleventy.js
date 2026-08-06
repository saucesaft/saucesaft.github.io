const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginAncestry = require("@tigersway/eleventy-plugin-ancestry");

const wikiModule = require('./.wiki.js');

var fs = require('fs');
const path = require('path');

const markdownIt = require('markdown-it');
const markdownItOptions = {
    html: true,
    linkify: true,
    breaks: true
};
const inspect = require("node:util").inspect;

const texmath = require('markdown-it-texmath');
const katex = require('katex');

module.exports = function(eleventyConfig) {

  // custom markdown-it instance
  const md = markdownIt(markdownItOptions)
    .use(require('markdown-it-attrs'))
    .use(texmath, {
      engine: katex,
      delimiters: 'dollars',
      katexOptions: { throwOnError: false },
    });

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

  // KaTeX renders a hidden MathML mirror of every formula (for screen readers)
  // alongside the visible HTML rendering. Plain-text excerpts need to drop that
  // mirror first, otherwise stripping tags leaves the glyph and raw tex source
  // concatenated (e.g. "λ\lambdaλ") instead of just "λ".
  eleventyConfig.addFilter("stripKatexMathml", function (html) {
    return (html || '').replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g, '');
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

  eleventyConfig.addFilter("endsWith", function(str, suffix) {
    if (!str) return false;
    return str.endsWith(suffix);
  });

  // get all wiki posts with a specific tag
  eleventyConfig.addFilter("getPostsByTag", function(collection, tag) {
    if (!tag) return [];
    return collection.filter(item => {
      return item.data.tags && item.data.tags.includes(tag);
    });
  });

  // get project from projects.json by tag
  eleventyConfig.addFilter("getProjectByTag", function(projectsList, tag) {
    if (!tag || !projectsList) return null;
    return projectsList.find(project => project.tag === tag);
  });

  // folders of things we want in the final output
  eleventyConfig.addPassthroughCopy('css')
  eleventyConfig.addPassthroughCopy('fonts')
  eleventyConfig.addPassthroughCopy('img')
  eleventyConfig.addPassthroughCopy('files')
  eleventyConfig.addPassthroughCopy('content/**/img/*')
  eleventyConfig.addPassthroughCopy({
    CNAME: 'CNAME'
  });
  eleventyConfig.addPassthroughCopy({
    'node_modules/katex/dist/katex.min.css': 'css/katex.min.css',
    'node_modules/katex/dist/fonts': 'css/fonts',
  });

  // add extra plugins
  eleventyConfig.setLibrary('md', md);
  eleventyConfig.addPlugin(pluginAncestry);
  eleventyConfig.addPlugin(syntaxHighlight);

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
