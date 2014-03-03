'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var helpers = require('./helpers');
var Flow = require('../lib/flow.js');
var ConfigWriter = require('../lib/configwriter.js');

describe('ConfigWriter', function () {
  before(helpers.directory('temp'));

  describe('constructor', function() {
    it('should check it\'s input');

    it('should allow for user-defined steps per block type', function() {
      var copy = {
        name: 'copy',
        createConfig: function() { return {}; }
      };

      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs', copy]}, 'post': {}});
      var cfgw = new ConfigWriter(flow, {input: 'app', dest: 'dist', staging: '.tmp'});
      var stepNames = [];
      cfgw.stepWriters('js').forEach(function(s) { stepNames.push(s.name);});
      assert.deepEqual(stepNames, ['concat', 'uglify', 'copy']);
    });

    it('should use in and out dirs');
  });

  describe('process', function() {
    var blocks = helpers.blocks();

    it('should check for input parameters');

    it('should output a set of config', function () {
      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {input: 'app', dest: 'dist', staging: '.tmp'} );
      var config = c.process(file);
      var expected = helpers.normalize({
        'concat':{ generated: { files: [
          { dest: '.tmp/concat/scripts/site.js', src: ['app/foo.js', 'app/bar.js', 'app/baz.js']}
        ]}},
        'uglify':{ generated: { files: [
          { dest: 'dist/scripts/site.js', src: ['.tmp/concat/scripts/site.js']}
        ]}}
      });

      assert.deepEqual(config, expected);
    });

    it('should detect missing sources when warnMissing=true', function (){
      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
      var blocks = helpers.blocks();
      blocks[0].src = ['foo.js'];
      var file = helpers.createFile('foo', 'warn-missing', blocks);
      var c = new ConfigWriter( flow, {input: 'warn-missing', dest: 'dist', staging: '.tmp'},
                               {warnMissing: true});
      assert.throws(function () { c.process(file); }, /can't resolve source reference "foo.js"/);
      fs.mkdirSync('warn-missing');
      fs.writeFileSync(path.join('warn-missing', 'foo.js'), 'var a=1;');
      c.process(file);
    });

    it('should search all root paths', function (){
      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
      var blocks = helpers.blocks();
      blocks[0].src = ['foo.js', 'bar.js'];
      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {root: ['dir1', 'dir2'], dest: 'dist', staging: '.tmp'},
                               {warnMissing: true});
      fs.mkdirSync('dir1');
      fs.writeFileSync(path.join('dir1', 'foo.js'), 'var foo=1;');
      fs.mkdirSync('dir2');
      fs.writeFileSync(path.join('dir2', 'bar.js'), 'var bar=1;');
      c.process(file);
    });

    describe('resolveSource hook option', function (){
      beforeEach(helpers.directory('temp'));
      beforeEach(function (){
        fs.mkdirSync('app');
        fs.mkdirSync('dir2');
      });

      it('should be invoked for each block', function (){
        var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
        var blocks = helpers.blocks();
        var file = helpers.createFile('foo', 'app', blocks);
        var queue = [];
        function resolveSource() {
          queue.push(Array.prototype.slice.call(arguments));
          return null;
        }
        var c = new ConfigWriter( flow, {root: 'app', dest: 'dist', staging: '.tmp'},
                                 {resolveSource: resolveSource});
        c.process(file);
        assert.deepEqual(queue, [
          ['foo.js', 'app', 'foo', 'scripts/site.js', ['app', 'app']],
          ['bar.js', 'app', 'foo', 'scripts/site.js', ['app', 'app']],
          ['baz.js', 'app', 'foo', 'scripts/site.js', ['app', 'app']],
        ]);
      });

      it('should override normal search when it returns a string', function (){
        var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
        var blocks = helpers.blocks();
        var file = helpers.createFile('foo', 'app', blocks);
        function resolveSource(sourceUrl) {
          if (sourceUrl === 'foo.js') { return path.join('dir2', 'foo2.js'); }
          return null;
        }
        var c = new ConfigWriter( flow, {root: 'app', dest: 'dist', staging: '.tmp'},
                                 {resolveSource: resolveSource, warnMissing: true});
        fs.writeFileSync(path.join('dir2', 'foo2.js'), 'var a=1;');
        fs.writeFileSync(path.join('app', 'bar.js'), 'var a=1;');
        fs.writeFileSync(path.join('app', 'baz.js'), 'var a=1;');
        c.process(file);
      });

      it('should be prevented from returning non-existent paths', function (){
        var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
        var blocks = helpers.blocks();
        var file = helpers.createFile('foo', 'app', blocks);
        function resolveSource(sourceUrl) {
          if (sourceUrl === 'foo.js') { return path.join('missing', 'foo.js'); }
          return null;
        }
        var c = new ConfigWriter( flow, {root: 'app', dest: 'dist', staging: '.tmp'},
                                 {resolveSource: resolveSource, warnMissing: true});
        fs.writeFileSync(path.join('app', 'bar.js'), 'var a=1;');
        fs.writeFileSync(path.join('app', 'baz.js'), 'var a=1;');
        assert.throws(function () { c.process(file); }, /returned non-existent path "missing[\\\/]foo.js"/);
      });

      it('should cancel normal search when it returns `false`, and invoke normal search when it returns `null`', function (){
        var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
        var blocks = helpers.blocks();
        var file = helpers.createFile('foo', 'app', blocks);
        var queue = [];
        function resolveSource(sourceUrl) {
          queue.push(sourceUrl);
          if (sourceUrl === 'baz.js') { return false; }
          return null;
        }
        var c = new ConfigWriter( flow, {root: 'app', dest: 'dist', staging: '.tmp'},
                                 {resolveSource: resolveSource, warnMissing: true});
        fs.writeFileSync(path.join('app', 'foo.js'), 'var a=1;');
        fs.writeFileSync(path.join('app', 'bar.js'), 'var a=1;');
        fs.writeFileSync(path.join('app', 'baz.js'), 'var a=1;');
        assert.throws(function () { c.process(file); }, /can't resolve source reference "baz.js"/);
        assert.deepEqual(queue, ['foo.js', 'bar.js', 'baz.js']);
      });

    });

    it('should have a configurable destination directory', function() {
      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});

      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {input: 'app', dest: 'destination', staging: '.tmp'} );
      var config = c.process(file);
      var expected = helpers.normalize({
        'concat': {generated: { files: [
          {dest: '.tmp/concat/scripts/site.js', src: ['app/foo.js', 'app/bar.js', 'app/baz.js']}
        ]}},
        'uglify': { generated: { files: [
          {dest: 'destination/scripts/site.js', src: ['.tmp/concat/scripts/site.js']}
        ]}}
      });

      assert.deepEqual(config, expected);
    });

    it('should have a configurable staging directory', function() {
      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});

      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {input: 'app', dest: 'dist', staging: 'staging'} );
      var config = c.process(file);
      var expected = helpers.normalize({
        'concat': {generated: { files: [
          {dest: 'staging/concat/scripts/site.js', src: ['app/foo.js', 'app/bar.js', 'app/baz.js'] }
        ]}},
        'uglify': {generated: { files: [
          {dest: 'dist/scripts/site.js', src: ['staging/concat/scripts/site.js'] }
        ]}}
      });

      assert.deepEqual(config, expected);
    });

    it('should allow for single step flow', function() {
      var flow = new Flow({'steps': {'js': ['uglifyjs']}});

      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {input: 'app', dest: 'dist', staging: 'staging'} );
      var config = c.process(file);
      var expected = helpers.normalize({'uglify': { 'generated': { files: [
        {dest: 'dist/scripts/site.js', src: ['app/foo.js', 'app/bar.js', 'app/baz.js']}
      ]}}});
      assert.deepEqual(config, expected);
    });

    it('should allow for a configuration of the flow\'s step order', function() {
      var flow = new Flow({'steps': {'js': ['uglifyjs', 'concat']}});

      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {input: 'app', dest: 'dist', staging: 'staging'} );
      var config = c.process(file);
      var expected = helpers.normalize({
        'uglify': {'generated' : { files: [
          {dest: 'staging/uglify/foo.js', src: ['app/foo.js']},
          {dest: 'staging/uglify/bar.js', src: ['app/bar.js']},
          {dest: 'staging/uglify/baz.js', src: ['app/baz.js']}
        ]}},
        'concat': {'generated' : { files: [
          {dest: 'dist/scripts/site.js', src: ['staging/uglify/foo.js', 'staging/uglify/bar.js', 'staging/uglify/baz.js']}
        ]}}
      });
      assert.deepEqual(config, expected);
    });

    it('should augment the furnished config', function() {
      var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs']}});
      var config = {concat: {misc:{'foo.js': 'bar.js'}}};
      var file = helpers.createFile('foo', 'app', blocks);
      var c = new ConfigWriter( flow, {input: 'app', dest: 'destination', staging: '.tmp'} );
      config = c.process(file, config);
      var expected = helpers.normalize({
        'concat': {'generated': { files: [{dest: '.tmp/concat/scripts/site.js', src: ['app/foo.js', 'app/bar.js', 'app/baz.js']}]}, 'misc': {'foo.js': 'bar.js'}},
        'uglify': {'generated': { files: [{dest: 'destination/scripts/site.js', src: ['.tmp/concat/scripts/site.js']}]}}
      });
      assert.deepEqual(config, expected);
    });
    it('should allow for a flow per block type');
    it('should allow for an empty flow');
    it('should allow for a filename as input');

    describe('stepWriters', function() {
      it('should return all writers if called without block type', function() {
        var flow = new Flow({'steps': {'js': ['concat', 'uglifyjs'], 'css': ['concat']}});
        var c = new ConfigWriter( flow, {input: 'app', dest: 'destination', staging: '.tmp'} );
        var names = [];
        c.stepWriters().forEach(function(i) { names.push(i.name);});
        assert.deepEqual( names, ['concat', 'uglify']);
      });
    });
  });
});
