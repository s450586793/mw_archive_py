const assert = require('node:assert/strict');

const {
    transformSummaryHtml,
    parseVideoEmbedInfo,
} = require('../app/static/js/model.js');

function run(name, fn) {
    try {
        fn();
        console.log('PASS', name);
    } catch (err) {
        console.error('FAIL', name);
        throw err;
    }
}

run('parses bilibili video page url into embeddable player url', function () {
    const info = parseVideoEmbedInfo('https://www.bilibili.com/video/BV1yWHNzZEYx/?vd_source=abc');
    assert.equal(info.platform, 'bilibili');
    assert.match(info.embedUrl, /player\.bilibili\.com\/player\.html\?bvid=BV1yWHNzZEYx/);
});

run('parses youtube watch url into embeddable player url', function () {
    const info = parseVideoEmbedInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(info.platform, 'youtube');
    assert.equal(info.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ');
});

run('transforms oembed media blocks into iframe video cards', function () {
    const html = '<figure class="media"><oembed url="https://www.bilibili.com/video/BV1yWHNzZEYx/"></oembed></figure>';
    const out = transformSummaryHtml(html, function (rel) { return './' + rel; });
    assert.match(out, /summary-video/);
    assert.match(out, /iframe/i);
    assert.match(out, /player\.bilibili\.com/);
});

run('falls back to safe external link for unsupported video providers', function () {
    const html = '<figure class="media"><oembed url="https://example.com/video/123"></oembed></figure>';
    const out = transformSummaryHtml(html, function (rel) { return './' + rel; });
    assert.doesNotMatch(out, /<iframe/i);
    assert.match(out, /summary-video__fallback/);
    assert.match(out, /https:\/\/example\.com\/video\/123/);
    assert.match(out, /打开原视频/);
});

run('uses chinese helper text for supported embedded videos', function () {
    const html = '<figure class="media"><oembed url="https://www.bilibili.com/video/BV1yWHNzZEYx/"></oembed></figure>';
    const out = transformSummaryHtml(html, function (rel) { return './' + rel; });
    assert.match(out, /在新标签页打开原视频/);
});
