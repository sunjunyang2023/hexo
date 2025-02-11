import { join } from 'path';
import { mkdirs, rmdir, unlink, writeFile } from 'hexo-fs';
import BluebirdPromise from 'bluebird';
import Hexo from '../../../lib/hexo';
import { source } from '../../../lib/theme/processors/source';
import chai from 'chai';
const should = chai.should();
type SourceParams = Parameters<typeof source['process']>
type SourceReturn = ReturnType<typeof source['process']>

describe('source', () => {
  const hexo = new Hexo(join(__dirname, 'source_test'), {silent: true});
  const process: (...args: SourceParams) => BluebirdPromise<SourceReturn> = BluebirdPromise.method(source.process.bind(hexo));
  const themeDir = join(hexo.base_dir, 'themes', 'test');
  const Asset = hexo.model('Asset');

  function newFile(options) {
    const { path } = options;

    options.params = {path};
    options.path = 'source/' + path;
    options.source = join(themeDir, options.path);

    return new hexo.theme.File(options);
  }

  before(async () => {
    await BluebirdPromise.all([
      mkdirs(themeDir),
      writeFile(hexo.config_path, 'theme: test')
    ]);
    await hexo.init();
  });

  after(() => rmdir(hexo.base_dir));

  it('pattern', () => {
    const { pattern } = source;

    pattern.match('source/foo.jpg').should.eql({path: 'foo.jpg'});
    pattern.match('source/_foo.jpg').should.be.false;
    pattern.match('source/foo/_bar.jpg').should.be.false;
    pattern.match('source/foo.jpg~').should.be.false;
    pattern.match('source/foo.jpg%').should.be.false;
    pattern.match('layout/foo.swig').should.be.false;
    pattern.match('layout/foo.njk').should.be.false;
    pattern.match('package.json').should.be.false;
    pattern.match('node_modules/test/test.js').should.be.false;
    pattern.match('source/node_modules/test/test.js').should.be.false;
  });

  it('type: create', async () => {
    const file = newFile({
      path: 'style.css',
      type: 'create'
    });

    const id = 'themes/test/' + file.path;

    await writeFile(file.source, 'test');
    await process(file);
    const asset = Asset.findById(id);

    asset._id.should.eql(id);
    asset.path.should.eql(file.params.path);
    asset.modified.should.be.true;

    asset.remove();

    unlink(file.source);
  });

  it('type: update', async () => {
    const file = newFile({
      path: 'style.css',
      type: 'update'
    });

    const id = 'themes/test/' + file.path;

    await BluebirdPromise.all([
      writeFile(file.source, 'test'),
      Asset.insert({
        _id: id,
        path: file.params.path,
        modified: false
      })
    ]);
    await process(file);
    const asset = Asset.findById(id);

    asset.modified.should.be.true;

    await BluebirdPromise.all([
      unlink(file.source),
      Asset.removeById(id)
    ]);
  });

  it('type: skip', async () => {
    const file = newFile({
      path: 'style.css',
      type: 'skip'
    });

    const id = 'themes/test/' + file.path;

    await BluebirdPromise.all([
      writeFile(file.source, 'test'),
      Asset.insert({
        _id: id,
        path: file.params.path,
        modified: false
      })
    ]);
    await process(file);
    const asset = Asset.findById(id);

    asset.modified.should.be.false;
    await BluebirdPromise.all([
      unlink(file.source),
      Asset.removeById(id)
    ]);
  });

  it('type: delete', async () => {
    const file = newFile({
      path: 'style.css',
      type: 'delete'
    });

    const id = 'themes/test/' + file.path;

    await Asset.insert({
      _id: id,
      path: file.params.path
    });
    await process(file);
    should.not.exist(Asset.findById(id));
  });

  it('type: delete - not -exist', async () => {
    const file = newFile({
      path: 'style.css',
      type: 'delete'
    });

    const id = 'themes/test/' + file.path;

    await process(file);
    should.not.exist(Asset.findById(id));
  });
});
