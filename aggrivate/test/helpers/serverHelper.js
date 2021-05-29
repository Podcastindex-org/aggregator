var nodeStatic = require('node-static');
var http = require('http');

function serveRSS() {
	const file = new(nodeStatic.Server)(__dirname + '/../rss');

	const server = http.createServer(function (req, res) {
	  file.serve(req, res);
	});

	const osAssignedFreePort = 0;
	server.listen(osAssignedFreePort);
	return server;
}

exports.serveRSS = serveRSS;
