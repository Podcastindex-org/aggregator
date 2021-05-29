const ini = require('ini');
const fs = require('graceful-fs');

function writeConfigFile(filename, config) {
	const iniContents = ini.encode(config);
	fs.writeFile(filename, iniContents);
}

exports.writeConfigFile = writeConfigFile;
