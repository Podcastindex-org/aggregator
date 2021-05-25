//Requires
var mysql = require('mysql');
var request = require('request');
var fs = require('graceful-fs');
var ini = require('ini');
var Iconv = require('iconv').Iconv;
var crypto = require('crypto');
var jschardet = require("jschardet");

//Environment
process.env.UV_THREADPOOL_SIZE = 128;

//Globals
let aggrivateVersion = 'v1.3.3';
var netcalls = 0;
var dbcalls = 0;
var dbcheck = 0;
var checkall = false;
var checkone = false;
var checkdead = false;
var checkerror = false;
var ckoneurl = '';
var netwait = 10;
var feedcount = 0;
var force = false;
var maxRowsToReturn = 200;
var maxContentLength = 25000000;
var timestarted = Math.floor(new Date() / 1000);
var stillWaitingForDB = true;
var waitingForDBCount = 12;
var feedWorkCount = 0;

//Get command line args
process.argv.forEach((val, index, array) => {
    console.log(index + ": [" + val + "]");
    if (index >= 2 && val === "checkall") {
        console.log("Checking all feeds.");
        checkall = true;
    }

    if (index >= 2 && val === "checkdead") {
        console.log("Checking dead feeds.");
        checkall = true;
    }

    if (index >= 2 && val === "checkerror") {
        console.log("Checking high error feeds.");
        checkerror = true;
    }

    if (index >= 2 && val === "force") {
        console.log("Ignoring last-modified.");
        force = true;
    }

    if (!checkall && index >= 2 && val.indexOf('http') !== -1) {
        console.log("Checking feed: [" + val + "]");
        ckoneurl = val;
        checkone = true;
    }
});

//Get the database and table info
var config = ini.parse(fs.readFileSync('/path/to/config/global.conf', 'utf-8'));

//console.log(config.database);
loggit(3, "DEBUG: Aggrivate is runnning.");

//Make sure files aren't just building up.  If they are, then partytime is probably stuck
if (countFeedFiles() > 1000) {
    console.error('Partytime.js appears to be held up. Backing off.');
    process.exit(1);
}

console.log("Connecting to mysql...");
//Get a connection to mysql
var connection = mysql.createConnection({
    host: config.database.cg_dbhost,
    user: config.database.cg_dbuser,
    password: config.database.cg_dbpass,
    database: config.database.cg_dbname,
    charset: 'utf8mb4'
});
connection.connect(function (err) {
    if (err) {
        console.error('Error connecting to mysql: ' + err.stack);
        process.exit(1);
    }
});
console.log("Done");

//Handy timestamps
var twoweeksago = Math.floor((Date.now() / 1000) - (14 * 86400));
var onemonthago = Math.floor((Date.now() / 1000) - (30 * 86400));
var twomonthsago = Math.floor((Date.now() / 1000) - (60 * 86400));
var threemonthsago = Math.floor((Date.now() / 1000) - (90 * 86400));

//Assemble query
var query = 'SELECT ' +
    'id,' +
    'title,' +
    'url,' +
    'lastmod,' +
    'createdon,' +
    'contenttype,' +
    'contenthash,' +
    'pullnow ' +
    'FROM ' + config.tables.cg_table_newsfeeds + ' ' +
    'WHERE (newest_item_pubdate > ' + twoweeksago + ' OR pullnow = 1) ' +
    'AND errors < 100 ' +
    'AND parse_errors < 100 ' +
    'AND dead=0 ' +
    'AND updated=0 ' +
    'ORDER by pullnow DESC, lastcheck ASC ' +
    'LIMIT ' + maxRowsToReturn;
// if (checkall && checkdead) {
//     query = 'SELECT id,title,url,lastmod,createdon,contenttype,contenthash FROM ' + config.tables.cg_table_newsfeeds + ' ORDER by pullnow DESC, lastcheck ASC LIMIT ' + maxRowsToReturn;
// }
// if (checkall && !checkdead) {
//     query = 'SELECT id,title,url,lastmod,createdon,contenttype,contenthash FROM ' + config.tables.cg_table_newsfeeds + ' WHERE dead=0 ORDER by pullnow DESC, lastcheck ASC LIMIT ' + maxRowsToReturn;
// }
// if (!checkall && checkdead) {
//     query = 'SELECT id,title,url,lastmod,createdon,contenttype,contenthash FROM ' + config.tables.cg_table_newsfeeds + ' WHERE dead=1 ORDER by pullnow DESC, lastcheck ASC LIMIT ' + maxRowsToReturn;
// }
// if (checkerror) {
//     query = 'SELECT id,title,url,lastmod,createdon,contenttype,contenthash FROM ' + config.tables.cg_table_newsfeeds + ' WHERE dead=0 AND ( errors > 100 || content = "") ORDER by pullnow DESC, lastcheck ASC LIMIT ' + maxRowsToReturn;
// }
if (checkone) {
    query = 'SELECT id,title,url,lastmod,createdon,contenttype,contenthash,pullnow FROM ' + config.tables.cg_table_newsfeeds + ' WHERE url="' + ckoneurl + '"';
}

console.log("QUERY: [" + query + "]");

//Pull the feed list
dbcalls++;
connection.query(query, function (err, rows, fields) {
    stillWaitingForDB = false;
    loggit(3, "Pulled [" + rows.length + "] feeds to process...");
    console.log("Pulled [" + rows.length + "] feeds to process...");

    //Bail on error
    if (err) throw err;

    //console.log(rows);
    if (rows.length < 1 && checkone) {
        console.log("Couldn't find feed: [" + ckoneurl + "] in the database.");
    }

    //These are the options that'll be passed to each request
    var opt = {
        followAllRedirects: true,
        gzip: true,
        strictSSL: false,
        encoding: null,
        timeout: 30000,
        jar: true,
        removeRefererHeader: true,
        maxRedirects: 9,
        forever: true,
        ecdhCurve: 'auto',
        maxConnections: 20,
        agentOptions : {
            keepAlive  : true,
            maxSockets : 100
        },
    };

    //Iterate all the feeds we got
    for (var row in rows) {
        var feed = rows[row];
        feedcount++;

        if (checkone) {
            console.log("Checking feed: [" + ckoneurl + "]");
        }

        //Don't attempt to fetch feeds with non-fqdn urls
        if (feed.url.toLowerCase().indexOf('http') !== 0) {
            console.log("Error: Skipping non-fqdn feed url: [" + feed.url + "]");
            continue;
        }

        //Make the get request
        (function (f) {
            netcalls++;
            var lastmod = 0;
            var redirectCodes = [];

            //The url to get
            opt.uri = f.url;

            //Keep track of multiple redirects
            opt.followRedirect = function (resp) {
                redirectCodes.push(resp.statusCode);
                return true;
            };

            //If pullnow was set, we ignore lastmod and other change checking and just get the download
            if(f.pullnow === 1) {
                force = true;
            }

            //Assemble a sane Last-Modified value to use
            if (f.lastmod === 0) {
                lastmod = new Date((Date.now() - (86400 * 1000))).toUTCString();
            } else {
                lastmod = new Date(f.lastmod * 1000).toUTCString();
            }
            if (force || checkerror || f.contenttype == 'none' || f.contenttype == '') {
                //Set the lastmod to 1/1/1970 so we get new content for everything
                lastmod = new Date(0).toUTCString();
            }
            f.lastmodPretty = lastmod;
            opt.headers = {
                'If-Modified-Since': lastmod,
                //'User-Agent': config.main.cg_system_name + "/" + config.main.cg_sys_version + " (+" + config.main.cg_producthome + ")",
                'User-Agent': 'Podcastindex.org/' + aggrivateVersion + ' (Aggrivate)',
                'Accept': 'application/xml,application/atom+xml,application/rss+xml,application/javascript,application/json,text/plain,text/xml;q=0.9, */*;q=0.8',
                'Accept-Charset': 'utf-8;q=0.9, iso-8859-1;q=0.8',
                'Accept-Language': 'en-US, en;q=0.9, fr-CH, fr;q=0.8, en;q=0.7, de;q=0.6, *;q=0.5'
            };

            //Do the request
            var httpreq = request(opt, function (err, response, body) {
                var requesterror = err;
                var xml = '';
                var xmlstring = '';
                var newmod = 0;
                var neterr = false;
                var processbody = true;
                var contentHash = "";
                var alreadystored = false;
                var contentChanged = false;

                //Error handler
                if (err) {
                    neterr = true;
                    console.log("  " + f.title + " : (" + f.lastmodPretty + ") " + f.url + " : error on next line");
                    console.log(err);

                    if (typeof err.code !== "undefined") {
                        if (err.code == 'ETIMEDOUT') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=900,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'Z_DATA_ERROR') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=909,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'EPROTO') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=908,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'ECONNRESET') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=901,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'ENOTFOUND') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+10,lasthttpstatus=902,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'EAI_AGAIN') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=903,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'ECONNREFUSED') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+10,lasthttpstatus=905,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'EHOSTUNREACH') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=906,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'ESOCKETTIMEDOUT') {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,lasthttpstatus=907,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        } else if (err.code == 'HPE_INVALID_CONSTANT') {
                            dbcalls++;

                            if (f.url.charAt(f.url.length - 1) == '/') {
                                var newurl = f.url.substr(0, f.url.length - 1);
                                console.log("Error with url: [" + f.url + "]. Changing url to: " + newurl);
                                connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET url=?,lastcheck=UNIX_TIMESTAMP(now()),updated=0,lasthttpstatus=904,pullnow=0 WHERE id=?', [newurl, f.id], function (err, result) {
                                    //if (err) throw err;
                                    if (err || result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                    dbcalls--;
                                });
                            } else {
                                connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),updated=0,lasthttpstatus=904,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                                    if (err) throw err;
                                    if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                    dbcalls--;
                                });
                            }
                        }

                        //If we didn't get a valid err.code then we just log this as an unknown error (999)
                    } else {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,lasthttpstatus=999,pullnow=0 WHERE id=?', [f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    }
                }

                //Assign the body
                xml = body;

                //Get content type
                var contype = "none";
                if (typeof response !== "undefined" && typeof response.headers !== "undefined" && 'content-type' in response.headers) {
                    contype = response.headers['content-type'];
                }

                //Make sure we get a feed body if force was asked for
                if (force) contentChanged = true;

                //Body checks before further processing
                if (typeof body !== "undefined" &&
                    typeof body.toString === "function" &&
                    typeof response !== "undefined" &&
                    typeof response.statusCode !== "undefined" &&
                    typeof response.headers !== "undefined" &&
                    'content-type' in response.headers) {

                    xmlstring = body.toString();
                    contentHash = crypto.createHash('md5').update(xmlstring).digest("hex");

                    var contentType = response.headers['content-type'];

                    //Encoding issues?
                    var charset = getParams(response.headers['content-type'] || '').charset;
                    xmlEncoding = jschardet.detect(body);
                    if (typeof xmlEncoding !== "undefined" && typeof xmlEncoding.encoding !== "undefined") {
                        charset = xmlEncoding.encoding;
                    }
                    xml = maybeTranslate(body, charset);

                    //If the content-type is not json, make sure it has the right xml parts
                    if (xmlstring.indexOf('<rss') < 0 &&
                        xmlstring.indexOf('<feed') < 0 &&
                        xmlstring.indexOf('<rdf') < 0 &&
                        contentType.indexOf('json') < 0 &&
                        response.statusCode === 200) {

                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=?,contenttype=?,contenthash=?,pullnow=0 WHERE id=?', [response.statusCode, contype, contentHash, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) {
                                console.log("Error updating database for feed: [" + f.url + "]");
                            } else {
                                alreadystored = true;
                            }
                            dbcalls--;
                        });
                        processbody = false;
                    }
                }

                //Get a hash of the feed raw content and determine if it changed or not
                if (typeof body !== "undefined" && typeof body.toString === "function") {
                    xmlstring = body.toString();
                    contentHash = crypto.createHash('md5').update(xmlstring).digest("hex");

                    //Did the content of the feed actually change?
                    if (f.contenthash == contentHash) {
                        //loggit(3, "Feed has not changed: [ "+f.contenthash+" | "+contentHash+" ]");
                        //contentChanged = false;
                    } else {
                        //loggit(3, "TAIL -- Feed: ["+f.url+"] content has changed: [ "+f.contenthash+" | "+contentHash+" ]");
                        contentChanged = true;
                    }
                }

                //Now do standard response processing
                if (processbody && typeof response !== "undefined" && typeof response.statusCode !== "undefined" && !neterr) {
                    //Log some basic info
                    //console.log("  " + f.title + " : (" + f.lastmodPretty + ") " + f.url + " : " + response.statusCode);

                    if (typeof response.headers['Last-Modified'] !== "undefined") {
                        newmod = Math.floor(Date.parse(response.headers['Last-Modified']) / 1000);
                    } else {
                        newmod = f.lastmod;
                        if (newmod === 0) {
                            newmod = Math.floor(Date.now() / 1000);
                        }
                    }
                    feedWorkCount++;
                    //loggit(3, "Feed ("+feedWorkCount+"): [" + f.url + "] LastMod: [" + f.lastmod + " | " + newmod + "] Response: [" + response.statusCode + "]");

                    //2xx response
                    if (response.statusCode / 100 === 2) {

                        if (xml.length > maxContentLength) {
                            console.log("  Error:  Feed content is too large for feed: [" + f.id + "|" + f.url + "].");
                        } else {
                            //dbcalls++;

                            var contentUpdated = 0;
                            if (contentChanged) {
                                contentUpdated = config.aggrivate.cg_aggrivate_hostid;
                                writeFeedFile(f.id, xml);
                                if (ckoneurl) {
                                    console.log("Feed changed.");
                                }
                            } else {
                                xml = "";
                            }

                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),lastmod=?,updated=?,lasthttpstatus=?,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,contenthash=?,pullnow=0 WHERE id=?', [newmod, contentUpdated, response.statusCode, contype, contentHash, f.id], function (err, result) {
                                if (err) {
                                    //Don't stop on encoding errors.  We've done all we can at this point to fix it
                                    if (err.code != 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
                                        throw err;
                                    } else {
                                        console.log("  Encoding error in feed: [" + f.url + "]. About to mangle it best we can by stripping non-utf8...");
                                        loggit(2, "  Encoding error in feed: [" + f.url + "]. About to mangle it best we can by stripping non-utf8...");

                                        //Strip out the non-utf8 stuff
                                        xml = stripNonUtf8(xml.toString());

                                        //Make another attempt to update the database now that we have "clean" content
                                        if(contentUpdated > 0) {
                                            writeFeedFile(f.id, xml);
                                        }
                                        dbcalls++;
                                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),lastmod=?,updated=?,lasthttpstatus=?,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,contenthash=?,pullnow=0 WHERE id=?', [newmod, contentUpdated, response.statusCode, contype, contentHash, f.id], function (err, result) {
                                            if (result.affectedRows === 0) {
                                                console.log("Error updating database with stripped content for feed: [" + f.url + "]");
                                            }
                                            dbcalls--;
                                        });
                                    }
                                    if (typeof result !== "undefined" && result.affectedRows === 0) {
                                        console.log("  Error updating database for feed: [" + f.url + "]");
                                    } else {
                                        //loggit(3, "Feed: ["+f.url+"] content has changed.");
                                    }

                                }
                                dbcalls--;
                            });
                        }
                    }

                    //3xx response
                    else if (response.statusCode === 302) {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),lasthttpstatus=302,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,pullnow=0 WHERE id=?', [contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    } else if (response.statusCode === 304) {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),lasthttpstatus=304,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,pullnow=0 WHERE id=?', [contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    } else if (response.statusCode === 307) {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),lasthttpstatus=307,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,pullnow=0 WHERE id=?', [contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    } else if (response.statusCode === 308) {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET lastcheck=UNIX_TIMESTAMP(now()),lasthttpstatus=308,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,pullnow=0 WHERE id=?', [contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    }

                    //4xx response
                    else if (response.statusCode / 100 === 4) {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+4,lasthttpstatus=?,contenttype=?,contenthash="",pullnow=0 WHERE id=?', [response.statusCode, contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    }

                    //5xx response
                    else if (response.statusCode / 100 === 5) {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+5,lasthttpstatus=?,contenttype=?,contenthash="",pullnow=0 WHERE id=?', [response.statusCode, contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    }

                    //Response we don't handle
                    else {
                        dbcalls++;
                        connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),errors=errors+1,lasthttpstatus=?,contenttype=?,contenthash="",pullnow=0 WHERE id=?', [response.statusCode, contype, f.id], function (err, result) {
                            if (err) throw err;
                            if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                            dbcalls--;
                        });
                    }

                    //Handle redirections, where the final url is different than the original one requested
                    if (typeof response !== "undefined" &&
                        typeof response.request !== "undefined" &&
                        typeof response.request.uri !== "undefined" &&
                        typeof response.request.uri.href === "string" &&
                        response.request.uri.href.indexOf("http") === 0 &&
                        response.request.uri.href !== f.url &&
                        0 in redirectCodes) {

                        console.log("  Redirected from: [" + f.url + "] to: [" + response.request.uri.href + " | " + redirectCodes[0] + " | " + response.statusCode + "]");
                        //loggit(3, "Aggrivate: Feed url redirect from: [" + f.url + "] to: [" + response.request.uri.href + " | " + redirectCodes[0] + " -> " + response.statusCode + "].");

                        if (redirectCodes[0] === 301) {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET url=?,lasthttpstatus=301,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,pullnow=0 WHERE id=?', [response.request.uri.href, contype, f.id], function (err, result) {
                                if (err) {
                                    console.log("Error updating feed url location in database. Err: [" + err.code + " | " + f.url + " -> " + response.request.uri.href + "] ");
                                    //loggit(2, "Error updating feed url location in database. Err: [" + err.code + " | "+f.url+" -> "+response.request.uri.href+"] ");
                                }
                                if (err && err.code == 'ER_DUP_ENTRY') {
                                    console.log("  Result: " + result);
                                    //loggit(3, "  Result: " + result);
                                }
                                //if (result.affectedRows === 0) console.log("Error updating database for feed: ["+f.url+"]");
                                dbcalls--;
                            });
                        } else if (redirectCodes[0] === 308) {
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET url=?,lasthttpstatus=308,lastgoodhttpstatus=UNIX_TIMESTAMP(now()),contenttype=?,pullnow=0 WHERE id=?', [response.request.uri.href, contype, f.id], function (err, result) {
                                if (err) {
                                    console.log("Error updating feed url location in database. Err: [" + err.code + " | " + f.url + " -> " + response.request.uri.href + "] ");
                                    //loggit(2, "Error updating feed url location in database. Err: [" + err.code + " | "+f.url+" -> "+response.request.uri.href+"] ");
                                }
                                //if (result.affectedRows === 0) console.log("Error updating database for feed: ["+f.url+"]");
                                dbcalls--;
                            });
                        }
                    }

                } else {
                    var statCode = 0;
                    if (typeof response !== "undefined") {
                        statCode = response.statusCode || -1;
                    }

                    //There was a structural error in the feed content
                    if (!requesterror && !alreadystored) {
                        if (!processbody) {
                            console.log("There was a structural error in the feed content for: [" + f.url + "] " + statCode);
                            //loggit(2, "There was a structural error in the feed content for: [" + f.url + "] " + statCode);
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,errors=errors+1,lasthttpstatus=?,contenttype=?,contenthash=?,pullnow=0 WHERE id=?', [statCode, contype, contentHash, f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) {
                                    console.log("Error updating database for feed: [" + f.url + "]");
                                }
                                dbcalls--;
                            });

                            //If neterr is set then we already handled this in the error handler section so skip
                        } else {
                            console.log("Something went wrong with feed: [" + f.url + "] but we don't handle that error yet " + statCode);
                            //loggit(2, "Something went wrong with feed: [" + f.url + "] but we don't handle that error yet " + statCode);
                            if (statCode == -1) {
                                console.log(response);
                            }
                            dbcalls++;
                            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET content="",lastcheck=UNIX_TIMESTAMP(now()),updated=0,lasthttpstatus=?,contenttype="",contenthash="",pullnow=0 WHERE id=?', [statCode, f.id], function (err, result) {
                                if (err) throw err;
                                if (result.affectedRows === 0) console.log("Error updating database for feed: [" + f.url + "]");
                                dbcalls--;
                            });
                        }
                    }
                }

                netcalls--;
            });

            //Important!  Set the socket timeout here
            httpreq.on('socket', function (socket) {
                socket.setTimeout(30000);
                socket.on('timeout', function() {
                    httpreq.abort();
                });
            });
        })(feed);

        //DEBUG: Break here when testing
        //break;
    }
});
dbcalls--;


function loggit(lognum, message) {
    //Timestamp for this log
    tstamp = new Date(Date.now()).toLocaleString();
    var fd;

    //Open the file
    switch (lognum) {
        case 1:
            if (config.logging.log_errors_only == 1) {
                return true;
            }
            fd = fs.createWriteStream(config.folders.cg_log + '/' + config.logging.cg_acclog, {'flags': 'a'});
            break;
        case 2:
            fd = fs.createWriteStream(config.folders.cg_log + '/' + config.logging.cg_errlog, {'flags': 'a'});
            break;
        case 3:
            fd = fs.createWriteStream(config.folders.cg_log + '/' + config.logging.cg_dbglog, {'flags': 'a'});
            break;
    }

    //Write the message
    fd.end("[" + tstamp + "] [LOCAL] (" + __filename + ") " + message + "\n");

    //Return
    return true;
}


function getParams(str) {
    var params = str.split(';').reduce(function (params, param) {
        var parts = param.split('=').map(function (part) {
            return part.trim();
        });
        if (parts.length === 2) {
            params[parts[0]] = parts[1];
        }
        return params;
    }, {});
    return params;
}

function maybeTranslate(content, charset) {
    var iconv;
    //console.log(charset);
    // Use iconv if its not utf8 already.
    if (!iconv && charset && !/utf-*8/i.test(charset)) {
        try {
            iconv = new Iconv(charset, 'utf-8');
            if (ckoneurl) {
                console.log('Converting from charset %s to utf-8', charset);
            }
            iconv.on('error', function () {
                console.log("Error translating with Iconv.");
            });
            // If we're using iconv, stream will be the output of iconv
            // otherwise it will remain the output of request
            return iconv.convert(new Buffer(content, 'binary')).toString('utf8')
            //res = res.pipe(iconv);
        } catch (err) {
            //res.emit('error', err);
            console.log("Error translating with Iconv. Err: " + err);
        }
    }
    return content;
}

dbcheck = setInterval(function () {
    console.log("--- Still: [" + dbcalls + "] database calls and: [" + netcalls + "] network requests. Feed count: [" + feedWorkCount + " of " + feedcount + "]. Netwait: [" + netwait + "].")
    if (stillWaitingForDB && waitingForDBCount == 0) {
        connection.end();
        console.log("Error - Aggrivate is exiting.  The database query never returned a list of feeds.");
        loggit(3, "DEBUG: Error - Aggrivate is exiting.  The database query never returned a list of feeds.");
        process.exit(1);
    }
    if (stillWaitingForDB) {
        waitingForDBCount--;
        return true;
    }
    if (dbcalls === 0 && (netcalls === 0 || netwait === 0)) {
        connection.end();
        console.log("Aggrivate finished running. Processed: [" + feedWorkCount + "] feeds in: [" + ((Math.floor(new Date() / 1000)) - timestarted) + "] seconds.");
        loggit(3, "DEBUG: Aggrivate finished running. Processed: [" + feedWorkCount + "] feeds in: [" + ((Math.floor(new Date() / 1000)) - timestarted) + "] seconds.");
        process.exit(0);
    }
    if (dbcalls === 0) {
        loggit(3, "DEBUG: Aggrivate still running. Processed: [" + feedWorkCount + "] feeds in: [" + ((Math.floor(new Date() / 1000)) - timestarted) + "] seconds so far.");
        netwait--;
    }
    if (dbcalls > 0) {
        loggit(3, "DEBUG: Aggrivate still running. Processed: [" + feedWorkCount + "] feeds in: [" + ((Math.floor(new Date() / 1000)) - timestarted) + "] seconds so far.");
        netwait = 10;
    }
}, 5000);

//Try to pull out all of the bad stuff
function stripNonUtf8(input) {
    var output = "";
    for (var i = 0; i < input.length; i++) {
        if (input.charCodeAt(i) <= 127 || input.charCodeAt(i) >= 160 && input.charCodeAt(i) <= 255) {
            output += input.charAt(i);
        }
    }
    return output;
}

//Writes the content of a feed to a file in the feeds dir
function writeFeedFile(feedId, content) {
    fs.writeFileSync(config.folders.feeds + feedId + '.tmp', content);
    fs.renameSync(config.folders.feeds + feedId + '.tmp', config.folders.feeds + feedId + '.txt')

    return true;
}

//Get a list of how many feed files are waiting to be parsed
function countFeedFiles() {
    var files = fs.readdirSync(config.folders.feeds);
    return files.length;
}