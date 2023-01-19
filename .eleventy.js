const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginAncestry = require("@tigersway/eleventy-plugin-ancestry");

// var prism = require('prismjs');
// require("prismjs/plugins/filter-highlight-all/prism-filter-highlight-all.min");
// require('prismjs/plugins/keep-markup/prism-keep-markup.js');

const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const tmp = require('tmp');
var fs = require('fs');
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

  // eleventy custom transform to render tikz code section as svgs using
  // locally installed latex installation and dvisvgm
  eleventyConfig.addTransform("tikzRenderer", function(content, outputPath) {
    if (!(outputPath && outputPath.endsWith(".html"))) {
      return content;
    }

    // create a virtual dom we can modify
    const dom = new JSDOM( content );

    // find all elemenets we need to find (tikz)
    let elements = dom.window.document.querySelectorAll('code.language-tikz');
    let replacers = dom.window.document.querySelectorAll('pre.language-tikz');

    // if there are no tikz processing needed to be done on this file, we return
    if (elements.length == 0) {
      return content;
    }

    for (let i = 0; i < elements.length; i++) {

      let tikz = elements[i].textContent;
      tikz = "\\documentclass[tikz]{standalone}" + tikz;

      // create a temporary folder
      // and delete it and its contents when done
      const tmpFolder = tmp.dirSync({
        unsafeCleanup: true,
      });

      // the latex file inside of the temp folder
      let latexFile = tmpFolder.name + '/source.tex';

      // create the file and write it the contents
      fs.writeFileSync(latexFile, tikz, 'utf-8');

      // run the latex cli on the filex we create, to get the dvi file
      const latexCmd = spawnSync('latex', ['-output-directory='+tmpFolder.name, latexFile]);

      // check errors
      if (latexCmd.error != undefined || String(latexCmd.stderr) != "") {
        console.log('error', latexCmd.error);
        console.log('stderr ', String(latexCmd.stderr));

        tmpFolder.removeCallback();

        return content
      }

      // the dvi file inside of the temp folder
      let dviFile = tmpFolder.name + '/source.dvi';

      // run dvisgm to convert the dvi file to an svg
      const dviCmd = spawnSync('dvisvgm', ['--stdout', dviFile]);

      // check errors
      if (dviCmd.error != undefined) {
        console.log('error', dviCmd.error);
        console.log('stderr ', String(dviCmd.stderr));
        
        tmpFolder.removeCallback();

        return content
      }

      // get the actual svg from the cmd
      const svg = new jsdom.JSDOM(String(dviCmd.stdout));

      // replace the contents of pre with the svg
      replacers[i].replaceChild(svg.window.document.body.children[0], elements[i]);

      // remove the class so that it doesn't get weirdly syntax highlighted
      replacers[i].classList.remove('language-tikz');

      // remove the temporary folder
      tmpFolder.removeCallback();
    }

    // return the dom we modified as an string
    return dom.serialize();

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
