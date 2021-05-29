const concat = require('concat-stream');
const spawn = require('child_process').spawn;

function execute(processPath, args = []) {
    return new Promise((resolve, reject) => {
        const childNodeProcess = createNodeProcess(processPath, args);
        childNodeProcess.stdin.setEncoding('utf-8');
        childNodeProcess.stderr.once('data', err => {
            reject(err.toString());
        });
        childNodeProcess.on('error', reject);
        childNodeProcess.stdout.pipe(
            concat(result => {
                resolve(result.toString());
            })
        );
    });
}

function createNodeProcess(processPath, args = []) {
    args = [processPath].concat(args);
    return spawn('node', args);
}

exports.execute = execute;

