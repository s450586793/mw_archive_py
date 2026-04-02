const assert = require('node:assert/strict');

const {
    getDownloadWarningConfig,
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

run('shows retryable warning for failed online model download', function () {
    const out = getDownloadWarningConfig({ download_status: 'failed', id: 123 }, true);
    assert.equal(out.visible, true);
    assert.equal(out.retryable, true);
    assert.match(out.text, /当前模型下载不完整，点击重试/);
});

run('shows plain warning when retry is unavailable', function () {
    const out = getDownloadWarningConfig({ download_status: 'failed', id: 0 }, false);
    assert.equal(out.visible, true);
    assert.equal(out.retryable, false);
    assert.match(out.text, /当前模型下载不完整/);
});

run('hides warning for non failed status', function () {
    const out = getDownloadWarningConfig({ download_status: 'ok', id: 123 }, true);
    assert.equal(out.visible, false);
});
