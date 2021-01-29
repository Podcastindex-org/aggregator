import mysql from 'mysql';
import fs from 'graceful-fs';
import ini from 'ini';
import crypto from 'crypto';
import parser from 'fast-xml-parser';
import he from 'he';


const paths = {
    config: process.env.CONFIG || '/path/to/config/global.conf',
    logs: process.env.LOGS || '/path/to/logs/',
    feeds: process.env.FEEDS || '/path/to/feeds/',
}

const now = () => Math.floor(Date.now()/ 1000);

//Globals
var netcalls = 0;
var dbcalls = 0;
var checkall = false;
var checkone = false;
var checkerror = false;
var ckoneurl = '';
var netwait = 240;
var feedcount = 0;
var force = false;
var maxRowsToReturn = 300;
var timestarted = now();
var stillWaitingForDB = true;
var waitingForDBCount = 240;
var feedWorkCount = 0;
var totalItemsAdded = 0;
const stmtPreCatmap = "INSERT INTO `nfcategories` (`feedid`, `catid1`, `catid2`, `catid3`, `catid4`, `catid5`, `catid6`, `catid7`, `catid8`, `catid9`, `catid10`) VALUES ";
const stmtPostCatmap = " ON DUPLICATE KEY UPDATE catid1 = VALUES(catid1),catid2 = VALUES(catid2),catid3 = VALUES(catid3),catid4 = VALUES(catid4),catid5 = VALUES(catid5),catid6 = VALUES(catid6),catid7 = VALUES(catid7),catid8 = VALUES(catid8),catid9 = VALUES(catid9),catid10 = VALUES(catid10) ";
var insertsCatmap = "";
const stmtPrePubsub = "INSERT INTO `pubsub` (`feedid`, `hub_url`, `self_url`) VALUES ";
const stmtPostPubsub = " ON DUPLICATE KEY UPDATE hub_url = VALUES(hub_url),self_url = VALUES(self_url) ";
var insertsPubsub = "";
var insertsPubsubBind: any[] = [];
const stmtPreValue = "INSERT INTO `nfvalue` (`feedid`, `value_block`) VALUES ";
const stmtPostValue = " ON DUPLICATE KEY UPDATE value_block = VALUES(value_block) ";
var insertsValue = "";
var insertsValueBind: string[] = [];
const stmtPreChapters = "INSERT INTO `nfitem_chapters` (`itemid`, `url`, `type`) VALUES ";
const stmtPostChapters = " ON DUPLICATE KEY UPDATE type = VALUES(type) ";
var insertsChapters = "";
var insertsChaptersBind: any[] = [];
const stmtPreTranscripts = "INSERT INTO `nfitem_transcripts` (`itemid`, `url`, `type`) VALUES ";
const stmtPostTranscripts = " ON DUPLICATE KEY UPDATE type = VALUES(type) ";
var insertsTranscripts = "";
var insertsTranscriptsBind: any[] = [];
const stmtPreFunding = "INSERT INTO `nffunding` (`feedid`, `url`, `message`) VALUES ";
const stmtPostFunding = " ON DUPLICATE KEY UPDATE url = VALUES(url), message = VALUES(message) ";
var insertsFunding = "";
var insertsFundingBind: any[] = [];
const stmtPreSoundbites = "INSERT INTO `nfitem_soundbites` (`itemid`, `title`, `start_time`, `duration`) VALUES ";
const stmtPostSoundbites = " ON DUPLICATE KEY UPDATE title = VALUES(title) ";
var insertsSoundbites = "";
var insertsSoundbitesBind: any[] = [];

//Get command line args
process.argv.forEach((val, index, _array) => {
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
var config = ini.parse(fs.readFileSync(paths.config, 'utf-8'));

//console.log(config.database);
loggit(3, "DEBUG: It's party time!");
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


//Assemble query
//Get all of the rows marked as updated
let query = 'SELECT ' +
    'feeds.id, ' +
    'feeds.title, ' +
    'feeds.url, ' +
    'feeds.content, ' +
    'feeds.newest_item_pubdate, ' +
    'feeds.update_frequency, ' +
    'feeds.podcast_owner, ' +
    'feeds.parsenow, ' +
    'MIN(apple.itunes_id) AS itunes_id, ' +
    'chash, ' +
    'COUNT(nfitems.id) AS itemcount ' +
    'FROM ' + config.tables.cg_table_newsfeeds + ' AS feeds ' +
    'LEFT JOIN directory_apple AS apple ON feeds.url = apple.feed_url ' +
    'LEFT JOIN nfitems AS nfitems ON feeds.id = nfitems.feedid ' +
    'WHERE feeds.updated=' + config.partytime.cg_partytime_hostid + ' ' +
    'GROUP BY feeds.id ' +
    'ORDER BY feeds.parsenow DESC, feeds.lastcheck ASC ' +
    'LIMIT ' + maxRowsToReturn;

    if (checkone) {
    query = 'SELECT feeds.id, feeds.url, feeds.content, apple.itunes_id ' +
        'FROM ' + config.tables.cg_table_newsfeeds + ' AS feeds ' +
        'LEFT JOIN directory_apple AS apple ON feeds.url = apple.feed_url ' +
        'WHERE feeds.url = "' + ckoneurl + '" ' +
        'ORDER BY feeds.id ASC LIMIT ' + maxRowsToReturn;
}

console.log("QUERY: [" + query + "]");

//Pull the feed list
dbcalls++;
connection.query(query, function (err, rows, _fields) {
    stillWaitingForDB = false;

    //Bail on error
    if (err) throw err;

    loggit(3, "Pulled [" + rows.length + "] feed bodies to parse...");
    console.log("Pulled [" + rows.length + "] feed bodies to parse...");

    //console.log(rows);
    if (rows.length < 1 && checkone) {
        console.log("Couldn't find feed: [" + ckoneurl + "] in the database.");
    }

    //Iterate through all the returned feeds and parse each one's content to search for feed items and enclosures
    rows.map((feed: any) => {
        let errorEncountered = false;
        feedcount++;

        console.log(feed.parsenow);

        //Call out feeds marked for immediate processing
        if (feed.parsenow > 0) {
            console.log('\x1b[33m%s\x1b[0m', 'PARSENOW: [' + feed.id + ' | ' + feed.url + ']');
        }

        //Set up fast-xml-parser
        let options = {
            attributeNamePrefix: "@_",
            attrNodeName: "attr", //default is 'false'
            textNodeName: "#text",
            ignoreAttributes: false,
            ignoreNameSpace: false,
            allowBooleanAttributes: false,
            parseNodeValue: true,
            parseAttributeValue: false,
            trimValues: true,
            //cdataTagName: "__cdata", //default is 'false'
            //cdataPositionChar: "\\c",
            parseTrueNumberOnly: false,
            arrayMode: false, //"strict"
            //attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
            tagValueProcessor: (val: string, _tagName: any) => he.decode(val), //default is a=>a
            stopNodes: ["parse-me-as-string"]
        };

        //Create the initial feed object
        let feedObj = {
            id: feed.id,
            itunesId: feed.itunes_id,
            url: feed.url,
            contentLength: feed.content.length,
            type: 0,
            language: 'en',
            lastItemUpdateTime: feed.newest_item_pubdate,
            newestItemPubDate: 0,
            oldestItemPubDate: 0,
            itemCount: 0,
            updateFrequency: feed.update_frequency,
            itemUrlStrings: '',
            chash: '',
            pubsub: false,
            podcastChapters: '',
            podcastLocked: 0,
            podcastOwner: feed.podcast_owner
        } as any;

        //If the feed file didn't exist move on
        if (!feedFileExists(feed.id)) {
            console.log('Feed file: [' + feed.id + '.txt] does not exist for feed: [' + feed.url + ']. Reverting update flag.');
            dbcalls++;
            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET updated=0 WHERE id=?', [feedObj.id], function (err, result) {
                if (err) throw err;
                if (result.affectedRows === 0) console.log("Error updating feed record for feed: [" + feed.url + "]");
                dbcalls--;
            });
            return;
        }
        feed.content = readFeedFile(feed.id);
        deleteFeedFile(feed.id);


        let parsedContent = parser.validate(feed.content.trim());
        if (parsedContent === true) { //optional (it'll return an object in case it's not valid)
            let theFeed = parser.parse(feed.content.trim(), options);

            if (checkone) {
                //console.log(theFeed);
            }


            //RSS ----------------------------------------------------------------------------------------------------------------------------------
            //--------------------------------------------------------------------------------------------------------------------------------------
            if (typeof theFeed.rss === "object") {
                if (typeof theFeed.rss.channel === "undefined") {
                    feed.type = 0;
                    markFeedAsUnparseable(feed);
                    return;
                }
                if (checkone) {
                    //console.log(theFeed.rss.channel.item);
                }

                //Key attributes
                feedObj.title = theFeed.rss.channel.title;
                feedObj.link = theFeed.rss.channel.link;
                feedObj.language = theFeed.rss.channel.language;
                feedObj.generator = theFeed.rss.channel.generator;
                feedObj.pubDate = theFeed.rss.channel.pubDate;
                feedObj.lastBuildDate = theFeed.rss.channel.lastBuildDate;
                feedObj.itunesType = theFeed.rss.channel['itunes:type'];
                feedObj.itunesCategory = theFeed.rss.channel['itunes:category'];
                feedObj.itunesNewFeedUrl = theFeed.rss.channel['itunes:new-feed-url'];
                feedObj.categories = [];
                feedObj.value = {};

                //Pubsub links?
                feedObj.pubsub = findPubSubLinks(theFeed.rss.channel);

                //Clean the title
                if (typeof feedObj.title === "string") {
                    feedObj.title = feedObj.title.trim().replace(/(\r\n|\n|\r)/gm, "");
                }

                //Clean the link
                if (typeof feedObj.link === "string") {
                    feedObj.link = feedObj.link.trim().replace(/(\r\n|\n|\r)/gm, "");
                }

                //Feed categories
                if (Array.isArray(feedObj.itunesCategory)) {
                    feedObj.itunesCategory.forEach((item: any) => {
                        if (typeof item === "object" && typeof item.attr !== "undefined" && typeof item.attr['@_text'] === "string") {
                            feedObj.categories.push(item.attr['@_text'].toLowerCase().replace('&amp;', '').split(/[ ]+/));

                            //Check for sub-items
                            if (typeof item['itunes:category'] === "object" && typeof item['itunes:category'].attr !== "undefined" && typeof item['itunes:category'].attr['@_text'] === "string") {
                                feedObj.categories.push(item['itunes:category'].attr['@_text'].toLowerCase().replace('&amp;', '').split(/[ ]+/));
                            }
                        }
                    });
                } else {
                    if (typeof feedObj.itunesCategory === "object" && typeof feedObj.itunesCategory.attr !== "undefined" && typeof feedObj.itunesCategory.attr['@_text'] === "string") {
                        feedObj.categories.push(feedObj.itunesCategory.attr['@_text'].toLowerCase().replace('&amp;', '').split(/[ ]+/));

                        //Check for sub-items
                        if (typeof feedObj.itunesCategory['itunes:category'] === "object" && typeof feedObj.itunesCategory['itunes:category'].attr !== "undefined" && typeof feedObj.itunesCategory['itunes:category'].attr['@_text'] === "string") {
                            feedObj.categories.push(feedObj.itunesCategory['itunes:category'].attr['@_text'].toLowerCase().replace('&amp;', '').split(/[ ]+/));
                        }
                    }
                }
                feedObj.categories = [...new Set(feedObj.categories.flat(9))];

                //Feed owner/author
                if (typeof theFeed.rss.channel['itunes:author'] !== "undefined") {
                    feedObj.itunesAuthor = theFeed.rss.channel['itunes:author'];
                    if (Array.isArray(feedObj.itunesAuthor)) {
                        feedObj.itunesAuthor = feedObj.itunesAuthor[0];
                    }
                    if (typeof feedObj.itunesAuthor === "object" && typeof feedObj.itunesAuthor['#text'] !== "undefined") {
                        feedObj.itunesAuthor = feedObj.itunesAuthor['#text'];
                    }
                }
                if (typeof theFeed.rss.channel['itunes:owner'] !== "undefined") {
                    if (typeof theFeed.rss.channel['itunes:owner']['itunes:email'] !== "undefined") {
                        feedObj.itunesOwnerEmail = theFeed.rss.channel['itunes:owner']['itunes:email'];
                    }
                    if (typeof theFeed.rss.channel['itunes:owner']['itunes:name'] !== "undefined") {
                        feedObj.itunesOwnerName = theFeed.rss.channel['itunes:owner']['itunes:name'];
                    }
                }
                if (typeof feedObj.itunesAuthor !== "string") feedObj.itunesAuthor = "";
                if (typeof feedObj.itunesOwnerEmail !== "string") feedObj.itunesOwnerEmail = "";
                if (typeof feedObj.itunesOwnerName !== "string") feedObj.itunesOwnerName = "";

                //Duplicate pubdate?
                if (Array.isArray(feedObj.pubDate)) {
                    feedObj.pubDate = feedObj.pubDate[0];
                }

                //Duplicate language?
                if (Array.isArray(feedObj.language)) {
                    feedObj.language = feedObj.language[0];
                }

                //Itunes specific stuff
                if (Array.isArray(feedObj.itunesType)) {
                    feedObj.itunesType = feedObj.itunesType[0];
                }
                if (typeof feedObj.itunesType === "object" && typeof feedObj.itunesType['#text'] === "string") {
                    feedObj.itunesType = feedObj.itunesType['#text'];
                }
                if (typeof feedObj.itunesType === "object" && typeof feedObj.itunesType.attr !== "undefined" && typeof feedObj.itunesType.attr['@_text'] === "string") {
                    feedObj.itunesType = feedObj.itunesType.attr['@_text'];
                }
                if (Array.isArray(feedObj.itunesNewFeedUrl)) {
                    feedObj.itunesNewFeedUrl = feedObj.itunesNewFeedUrl[0];
                }

                //Feed generator
                if (Array.isArray(feedObj.generator)) {
                    feedObj.generator = feedObj.generator[0];
                }

                //Feed image
                feedObj.itunesImage = "";
                if (typeof theFeed.rss.channel['itunes:image'] === "object") {
                    if (typeof theFeed.rss.channel['itunes:image'].url === "string") {
                        feedObj.itunesImage = theFeed.rss.channel['itunes:image'].url;
                    }
                    if (typeof theFeed.rss.channel['itunes:image'].attr !== "undefined" && typeof theFeed.rss.channel['itunes:image'].attr['@_href'] === "string") {
                        feedObj.itunesImage = theFeed.rss.channel['itunes:image'].attr['@_href'];
                    }
                }
                if (typeof theFeed.rss.channel['itunes:image'] === "string") {
                    feedObj.itunesImage = theFeed.rss.channel['itunes:image'];
                }
                feedObj.itunesImage = sanitizeUrl(feedObj.itunesImage);
                feedObj.image = "";
                if (typeof theFeed.rss.channel.image !== "undefined" && typeof theFeed.rss.channel.image.url === "string") {
                    feedObj.image = theFeed.rss.channel.image.url;
                }
                if (feedObj.image === "" && feedObj.itunesImage !== "") {
                    feedObj.image = feedObj.itunesImage;
                }
                feedObj.image = sanitizeUrl(feedObj.image);

                //Feed explicit content
                feedObj.explicit = 0;
                if (Array.isArray(theFeed.rss.channel['itunes:explicit'])) {
                    theFeed.rss.channel['itunes:explicit'] = theFeed.rss.channel['itunes:explicit'][0];
                }
                if (typeof theFeed.rss.channel['itunes:explicit'] === "string"
                    && (theFeed.rss.channel['itunes:explicit'].toLowerCase() == "yes" || theFeed.rss.channel['itunes:explicit'].toLowerCase() == "true")) {
                    feedObj.explicit = 1;
                }
                if (typeof theFeed.rss.channel['itunes:explicit'] === "boolean" && theFeed.rss.channel['itunes:explicit']) {
                    feedObj.explicit = 1;
                }

                //Feed description
                feedObj.description = theFeed.rss.channel.description;
                if (typeof theFeed.rss.channel['itunes:summary'] !== "undefined" && theFeed.rss.channel['itunes:summary'] != "") {
                    feedObj.description = theFeed.rss.channel['itunes:summary'];
                    if (Array.isArray(theFeed.rss.channel['itunes:summary'])) {
                        feedObj.description = theFeed.rss.channel['itunes:summary'][0];

                    }
                    if (typeof theFeed.rss.channel['itunes:summary'] === "object" && typeof theFeed.rss.channel['itunes:summary']['#text'] !== "undefined") {
                        feedObj.description = theFeed.rss.channel['itunes:summary']['#text'];
                    }
                }
                if (typeof feedObj.description !== "string") {
                    feedObj.description = "";
                }

                //Feed link
                if (Array.isArray(theFeed.rss.channel.link)) {
                    feedObj.link = theFeed.rss.channel.link[0];
                }
                if (typeof feedObj.link === "object") {
                    if (typeof feedObj.link['#text'] !== "undefined") {
                        feedObj.link = feedObj.link['#text'];
                    } else if (typeof feedObj.link.attr["@_href"] !== "undefined") {
                        feedObj.link = feedObj.link.attr['@_href'];
                    } else {
                        if (typeof feedObj.url !== "undefined" && feedObj.url === "string") {
                            feedObj.link = feedObj.url;
                        }
                    }
                }
                if (typeof feedObj.link !== "string") {
                    feedObj.link = "";
                }

                //Value block
                if (typeof theFeed.rss.channel['podcast:value'] !== "undefined" &&
                    typeof theFeed.rss.channel['podcast:value'].attr !== "undefined") {
                    console.log(theFeed.rss.channel['podcast:value']);
                    //Get the model
                    feedObj.value.model = {
                        'type': theFeed.rss.channel['podcast:value'].attr['@_type'],
                        'method': theFeed.rss.channel['podcast:value'].attr['@_method'],
                        'suggested': theFeed.rss.channel['podcast:value'].attr['@_suggested']
                    }

                    //Get the recipients
                    feedObj.value.destinations = [];
                    if (typeof theFeed.rss.channel['podcast:value']['podcast:valueRecipient'] === "object") {
                        let valueRecipients = theFeed.rss.channel['podcast:value']['podcast:valueRecipient'];
                        if (Array.isArray(valueRecipients)) {
                            valueRecipients.forEach((item: any) => {
                                if (typeof item.attr !== "undefined") {
                                    feedObj.value.destinations.push({
                                        'name': item.attr['@_name'],
                                        'type': item.attr['@_type'],
                                        'address': item.attr['@_address'],
                                        'split': item.attr['@_split']
                                    });
                                }
                            });
                        } else {
                            if (typeof valueRecipients.attr !== "undefined") {
                                feedObj.value.destinations.push({
                                    'name': valueRecipients.attr['@_name'],
                                    'type': valueRecipients.attr['@_type'],
                                    'address': valueRecipients.attr['@_address'],
                                    'split': valueRecipients.attr['@_split']
                                });
                            }
                        }
                    }

                    console.log(feedObj.value);
                    insertsValue += " (?,?),";
                    insertsValueBind.push(feedObj.id);
                    insertsValueBind.push(JSON.stringify(feedObj.value));
                }

                //Locked?
                if (typeof theFeed.rss.channel['podcast:locked'] === "object") {
                    if (theFeed.rss.channel['podcast:locked']['#text'].trim().toLowerCase() === "yes" ||
                        theFeed.rss.channel['podcast:locked']['#text'].trim().toLowerCase() === "true") {
                        feedObj.podcastLocked = 1;
                    }
                    if (typeof theFeed.rss.channel['podcast:locked'].attr['@_owner'] === "string" &&
                        theFeed.rss.channel['podcast:locked'].attr['@_owner'] !== "") {
                        feedObj.podcastOwner = theFeed.rss.channel['podcast:locked'].attr['@_owner'];
                    }
                    if (typeof theFeed.rss.channel['podcast:locked'].attr['@_email'] === "string" &&
                        theFeed.rss.channel['podcast:locked'].attr['@_email'] !== "") {
                        feedObj.podcastOwner = theFeed.rss.channel['podcast:locked'].attr['@_email'];
                    }

                    let lockLog = feedObj.podcastOwner + "[" + feedObj.podcastLocked + "] - " + feedObj.url;

                    console.log('\x1b[33m%s\x1b[0m', 'LOCKED: ' + lockLog);
                }

                //Funding
                if (typeof theFeed.rss.channel['podcast:funding'] === "object") {
                    let fundingMessage = "";
                    if (typeof theFeed.rss.channel['podcast:funding']['#text'] === "string" && theFeed.rss.channel['podcast:funding']['#text'] !== "") {
                        fundingMessage = theFeed.rss.channel['podcast:funding']['#text'];
                    }
                    if (typeof theFeed.rss.channel['podcast:funding'].attr['@_url'] === "string" &&
                        theFeed.rss.channel['podcast:funding'].attr['@_url'] !== "") {
                        feedObj.podcastFunding = {
                            message: fundingMessage,
                            url: theFeed.rss.channel['podcast:funding'].attr['@_url']
                        }
                    }

                    console.log(feedObj.podcastFunding);
                    insertsFunding += " (?,?,?),";
                    insertsFundingBind.push(feedObj.id);
                    insertsFundingBind.push(feedObj.podcastFunding.url);
                    insertsFundingBind.push(feedObj.podcastFunding.message);
                }

                //Feed title
                if (typeof feedObj.title !== "string") {
                    feedObj.title = "";
                }

                //The feed object must have an array of items even if it's blank
                feedObj.items = [];

                //console.log("DEBUG: " + theFeed.rss.channel.item);

                //------------------------------------------------------------------------
                //Are there even any items to get
                if (typeof theFeed.rss.channel.item !== "undefined") {
                    //Make sure the item element is always an array
                    if (!Array.isArray(theFeed.rss.channel.item)) {
                        let newItem = [];
                        newItem[0] = theFeed.rss.channel.item;
                        theFeed.rss.channel.item = newItem;
                    }

                    //Items
                    let i = 0;
                    feedObj.items = [];
                    theFeed.rss.channel.item.forEach((item: any) => {
                        //console.log(item);
                        let itemguid = "";

                        //If there is no enclosure, just skip this item and move on to the next
                        if (typeof item.enclosure !== "object") {
                            return;
                        }

                        //If there is more than one enclosure in the item, just get the first one
                        if (Array.isArray(item.enclosure)) {
                            item.enclosure = item.enclosure[0];
                        }

                        //If there is no guid in the item, then skip this item and move on
                        if (typeof item.guid !== "undefined") {
                            itemguid = item.guid;
                            if (typeof item.guid['#text'] === "string") {
                                itemguid = item.guid['#text'];
                            }
                        }
                        if (typeof itemguid !== "string" || itemguid === "") {
                            return;
                        }

                        feedObj.items[i] = {
                            title: item.title,
                            link: item.link,
                            itunesEpisode: item['itunes:episode'],
                            itunesEpisodeType: item['itunes:episodeType'],
                            itunesSeason: item['itunes:season'],
                            itunesExplicit: 0,
                            enclosure: {
                                url: item.enclosure.attr['@_url'],
                                length: parseInt(item.enclosure.attr['@_length']),
                                type: item.enclosure.attr['@_type']
                            },
                            pubDate: pubDateToTimestamp(item.pubDate),
                            guid: itemguid,
                            description: ""
                        }

                        //Item title
                        if (typeof feedObj.items[i].title === "string") {
                            feedObj.items[i].title = feedObj.items[i].title.trim();
                        } else {
                            feedObj.items[i].title = "";
                        }
                        if (typeof item['itunes:title'] !== "undefined" && item['itunes:title'] != "") {
                            feedObj.items[i].title = item['itunes:title'];
                        }

                        //Item link
                        if (typeof feedObj.items[i].link === "object") {
                            if (typeof feedObj.items[i].link['#text'] === "string") {
                                feedObj.items[i].link = feedObj.items[i].link['#text'];
                            }
                            if (typeof feedObj.items[i].link.attr !== "undefined") {
                                if (typeof feedObj.items[i].link.attr['@_href'] === "string" && feedObj.items[i].link.attr['@_href'] !== "") {
                                    feedObj.items[i].link = feedObj.items[i].link.attr['@_href'];
                                }
                            }
                        }
                        if (typeof feedObj.items[i].link !== "string") {
                            feedObj.items[i].link = "";
                        }

                        //Item image
                        feedObj.items[i].itunesImage = "";
                        if (typeof item['itunes:image'] === "object") {
                            if (typeof item['itunes:image'].url === "string") {
                                feedObj.items[i].itunesImage = item['itunes:image'].url;
                            }
                            if (typeof item['itunes:image'].attr !== "undefined" && typeof item['itunes:image'].attr['@_href'] === "string") {
                                feedObj.items[i].itunesImage = item['itunes:image'].attr['@_href'];
                            }
                        }
                        if (typeof item['itunes:image'] === "string") {
                            feedObj.items[i].itunesImage = item['itunes:image'];
                        }
                        feedObj.items[i].itunesImage = sanitizeUrl(feedObj.items[i].itunesImage);
                        feedObj.items[i].image = "";
                        if (typeof item.image !== "undefined" && typeof item.image.url === "string") {
                            feedObj.items[i].image = item.image.url;
                        }
                        if (feedObj.items[i].image === "" && feedObj.items[i].itunesImage !== "") {
                            feedObj.items[i].image = feedObj.items[i].itunesImage;
                        }
                        feedObj.items[i].image = sanitizeUrl(feedObj.items[i].image);

                        //Itunes specific stuff
                        if (typeof item['itunes:explicit'] === "string" &&
                            (item['itunes:explicit'].toLowerCase() == "yes" || item['itunes:explicit'].toLowerCase() == "true")) {
                            feedObj.items[i].itunesExplicit = 1;
                        }
                        if (typeof item['itunes:explicit'] === "boolean" && item['itunes:explicit']) {
                            feedObj.items[i].itunesExplicit = 1;
                        }
                        if (typeof item['itunes:duration'] !== "undefined") {
                            if (typeof item['itunes:duration'] === "string") {
                                feedObj.items[i].itunesDuration = timeToSeconds(item['itunes:duration']);
                                if (isNaN(feedObj.items[i].itunesDuration)) {
                                    feedObj.items[i].itunesDuration = 0;
                                }
                            } else if (typeof item['itunes:duration'] === "number") {
                                feedObj.items[i].itunesDuration = truncateInt(item['itunes:duration']);
                            }

                        } else {
                            feedObj.items[i].itunesDuration = 0;
                        }
                        if (typeof feedObj.items[i].itunesEpisode === "string") {
                            feedObj.items[i].itunesEpisode = feedObj.items[i].itunesEpisode.replace(/\D/g, '');
                            if (feedObj.items[i].itunesEpisode != "") {
                                feedObj.items[i].itunesEpisode = parseInt(feedObj.items[i].itunesEpisode);
                            }
                        }
                        if (typeof feedObj.items[i].itunesEpisode !== "number") {
                            delete feedObj.items[i].itunesEpisode;
                        }
                        if (Array.isArray(feedObj.items[i].itunesEpisodeType)) {
                            feedObj.items[i].itunesEpisodeType = feedObj.items[i].itunesEpisodeType[0];
                        }
                        if (typeof feedObj.items[i].itunesEpisodeType === "object" && typeof feedObj.items[i].itunesEpisodeType['#text'] === "string") {
                            feedObj.items[i].itunesEpisodeType = feedObj.items[i].itunesEpisodeType['#text'];
                        }
                        if (Array.isArray(feedObj.items[i].itunesSeason)) {
                            feedObj.items[i].itunesSeason = feedObj.items[i].itunesSeason[0];
                        }
                        if (typeof feedObj.items[i].itunesSeason === "object" && typeof feedObj.items[i].itunesSeason['#text'] === "string") {
                            feedObj.items[i].itunesSeason = feedObj.items[i].itunesSeason['#text'];
                        }

                        //Item description
                        if (typeof item['itunes:summary'] !== "undefined" && item['itunes:summary'] != "") {
                            feedObj.items[i].description = item['itunes:summary'];
                        }
                        if (typeof item.description !== "undefined" && item.description != "") {
                            if (typeof item.description['content:encoded'] !== "undefined") {
                                feedObj.items[i].description = item.description['content:encoded'];
                            } else {
                                feedObj.items[i].description = item.description;
                            }
                        }
                        if (typeof feedObj.items[i].description === "string") {
                            feedObj.items[i].description = feedObj.items[i].description.trim();
                        } else {
                            feedObj.items[i].description = "";
                        }

                        //Enclosure
                        if (isNaN(feedObj.items[i].enclosure.length)) {
                            feedObj.items[i].enclosure.length = 0;
                        }
                        if (typeof feedObj.items[i].enclosure.type === "undefined" || feedObj.items[i].enclosure.type === null || feedObj.items[i].enclosure.type === "") {
                            feedObj.items[i].enclosure.type = guessEnclosureType(feedObj.items[i].enclosure.url);
                        }

                        //Transcripts
                        if (Array.isArray(item['podcast:transcript'])) {
                            item['podcast:transcript'] = item['podcast:transcript'][0];
                        }
                        if (typeof item['podcast:transcript'] !== "undefined" &&
                            typeof item['podcast:transcript'].attr === "object" &&
                            typeof item['podcast:transcript'].attr['@_url'] === "string"
                        ) {
                            feedObj.items[i].podcastTranscripts = {
                                url: item['podcast:transcript'].attr['@_url'],
                                type: 0
                            }
                        }

                        //Chapters
                        if (typeof item['podcast:chapters'] !== "undefined" &&
                            typeof item['podcast:chapters'].attr === "object" &&
                            typeof item['podcast:chapters'].attr['@_url'] === "string"
                        ) {
                            feedObj.items[i].podcastChapters = {
                                url: item['podcast:chapters'].attr['@_url'],
                                type: 0
                            }
                        }

                        //Soundbites
                        if (Array.isArray(item['podcast:soundbite'])) {
                            feedObj.items[i].podcastSoundbites = [];
                            item['podcast:soundbite'].forEach(function (soundbite, _index, _array) {
                                if (typeof soundbite !== "undefined" &&
                                    typeof soundbite.attr === "object" &&
                                    typeof soundbite.attr['@_startTime'] !== "undefined" &&
                                    typeof soundbite.attr['@_duration'] !== "undefined"
                                ) {
                                    feedObj.items[i].podcastSoundbites.push({
                                        startTime: soundbite.attr['@_startTime'],
                                        duration: soundbite.attr['@_duration'],
                                        title: truncateString(soundbite['#text'], 500)
                                    });
                                    console.log(soundbite);
                                    console.log(feedObj.items[i].podcastSoundbites);
                                }
                            });
                        } else {
                            if (typeof item['podcast:soundbite'] !== "undefined" &&
                                typeof item['podcast:soundbite'].attr === "object" &&
                                typeof item['podcast:soundbite'].attr['@_startTime'] !== "undefined" &&
                                typeof item['podcast:soundbite'].attr['@_duration'] !== "undefined"
                            ) {
                                feedObj.items[i].podcastSoundbites = {
                                    startTime: item['podcast:soundbite'].attr['@_startTime'],
                                    duration: item['podcast:soundbite'].attr['@_duration'],
                                    title: truncateString(item['podcast:soundbite']['#text'], 500)
                                }
                                console.log(item['podcast:soundbite']);
                                console.log(feedObj.items[i].podcastSoundbites);
                            }
                        }


                        i++;
                    });

                    //Get the pubdate of the most recent item
                    let mostRecentPubDate = 0;
                    feedObj.items.forEach((item: any) => {
                        let thisPubDate = pubDateToTimestamp(item.pubDate);
                        if (thisPubDate > mostRecentPubDate && thisPubDate <= timestarted) {
                            mostRecentPubDate = thisPubDate;
                        }
                        if (checkone) console.log(item.pubDate + ": " + pubDateToTimestamp(item.pubDate));
                    });
                    feedObj.newestItemPubDate = mostRecentPubDate;

                    //Get the pubdate of the oldest item
                    let oldestPubDate = mostRecentPubDate;
                    feedObj.items.forEach((item: any) => {
                        let thisPubDate = pubDateToTimestamp(item.pubDate);
                        if (thisPubDate < oldestPubDate && thisPubDate > 0) {
                            oldestPubDate = thisPubDate;
                        }
                        if (checkone) console.log(item.pubDate + ": " + pubDateToTimestamp(item.pubDate));
                    });
                    feedObj.oldestItemPubDate = oldestPubDate;
                }

                if (checkone) console.log("PubDate: " + feedObj.pubDate);

                //Make sure we have a valid pubdate if possible
                if (feedObj.pubDate == "" || feedObj.pubDate == 0 || isNaN(feedObj.pubDate)) {
                    if (typeof feedObj.lastBuildDate !== "string") {
                        feedObj.pubDate = 0;
                    } else {
                        feedObj.pubDate = feedObj.lastBuildDate;
                    }
                }
                if (typeof feedObj.pubDate === "string") {
                    feedObj.pubDate = pubDateToTimestamp(feedObj.pubDate);
                }
                if (typeof feedObj.newestItemPubDate === "number") {
                    if (typeof feedObj.pubDate !== "number" || feedObj.pubDate == 0) {
                        feedObj.pubDate = feedObj.newestItemPubDate;
                    }
                }


            //ATOM ---------------------------------------------------------------------------------------------------------------------------------
            //--------------------------------------------------------------------------------------------------------------------------------------
            } else if (typeof theFeed.feed === "object") {
                feedObj.type = 1;

                if (checkone) {
                    //console.log(theFeed);
                    //console.log('--------------');
                    //console.log(theFeed.feed.entry);
                    //console.log('--------------');
                }

                //Key attributes
                feedObj.title = theFeed.feed.title;
                feedObj.link = theFeed.feed.link;
                feedObj.description = theFeed.feed.subtitle;
                feedObj.language = theFeed.feed.language;
                feedObj.generator = theFeed.feed.generator;
                feedObj.pubDate = theFeed.feed.updated;
                feedObj.lastBuildDate = theFeed.feed.updated;
                feedObj.itunesType = theFeed.feed['itunes:type'];
                feedObj.itunesCategory = theFeed.feed['itunes:category'];
                feedObj.itunesNewFeedUrl = theFeed.feed['itunes:new-feed-url'];
                if (typeof theFeed.feed.author === "object" && typeof theFeed.feed.author.name === "string") {
                    feedObj.itunesAuthor = theFeed.feed.author.name;
                    feedObj.itunesOwnerName = theFeed.feed.author.name;
                }
                if (typeof theFeed.feed.author === "object" && typeof theFeed.feed.author.email === "string") {
                    feedObj.itunesOwnerEmail = theFeed.feed.author.email;
                }

                //Pubsub links?
                feedObj.pubsub = findPubSubLinks(theFeed.feed);

                //Feed title
                if (Array.isArray(theFeed.feed.title)) {
                    feedObj.title = theFeed.feed.title[0];
                }
                if (typeof feedObj.title === "object") {
                    if (typeof feedObj.title['#text'] === "string") {
                        feedObj.title = feedObj.title['#text'];
                    }
                }
                if (typeof feedObj.title !== "string") {
                    feedObj.title = "";
                }

                //Feed description
                if (Array.isArray(feedObj.description)) {
                    feedObj.description = feedObj.description[0];
                }
                if (typeof feedObj.description === "object") {
                    if (typeof feedObj.description['#text'] === "string") {
                        feedObj.description = feedObj.description['#text'];
                    }
                    if (typeof feedObj.description['#html'] === "string") {
                        feedObj.description = feedObj.description['#text'];
                    }
                }
                if (typeof feedObj.description !== "string") {
                    feedObj.description = "";
                }

                //Feed link
                if (Array.isArray(theFeed.feed.link)) {
                    feedObj.link = theFeed.feed.link[0];
                }
                if (typeof feedObj.link === "object") {
                    if (typeof feedObj.link['#text'] !== "undefined") {
                        feedObj.link = feedObj.link['#text'];
                    } else if (typeof feedObj.link.attr["@_href"] !== "undefined") {
                        feedObj.link = feedObj.link.attr['@_href'];
                    } else {
                        if (typeof feedObj.url !== "undefined" && feedObj.url === "string") {
                            feedObj.link = feedObj.url;
                        }
                    }
                }
                if (typeof feedObj.link !== "string") {
                    feedObj.link = "";
                }

                //Feed generator
                if (Array.isArray(theFeed.feed.generator)) {
                    feedObj.generator = theFeed.feed.generator[0];
                }
                if (typeof feedObj.generator === "object") {
                    if (typeof feedObj.generator['#text'] !== "undefined") {
                        feedObj.generator = feedObj.generator['#text'];
                    }
                }
                if (typeof feedObj.generator !== "string") {
                    feedObj.generator = "";
                }

                //Feed explicit content
                feedObj.explicit = 0;
                if (typeof theFeed.feed['itunes:explicit'] === "string"
                    && (theFeed.feed['itunes:explicit'].toLowerCase() == "yes" || theFeed.feed['itunes:explicit'].toLowerCase() == "true")) {
                    feedObj.explicit = 1;
                }
                if (typeof theFeed.feed['itunes:explicit'] === "boolean" && theFeed.feed['itunes:explicit']) {
                    feedObj.explicit = 1;
                }

                //Feed image
                feedObj.image = theFeed.feed.logo;
                if (typeof theFeed.feed['itunes:image'] !== "undefined") {
                    if (typeof theFeed.feed['itunes:image'] === "object") {
                        feedObj.itunesImage = theFeed.feed['itunes:image'].attr['@_href'];
                    } else {
                        feedObj.itunesImage = theFeed.feed['itunes:image'];
                    }
                }
                feedObj.image = "";
                if (typeof theFeed.feed.image !== "undefined" && typeof theFeed.feed.image.url !== "undefined") {
                    feedObj.image = theFeed.feed.image.url;
                }
                if (typeof feedObj.image === "undefined"
                    && (typeof feedObj.itunesImage !== "undefined" && feedObj.itunesImage != "")) {
                    feedObj.image = feedObj.itunesImage;
                }

                //The feed object must have an array of items even if it's blank
                feedObj.items = [];


                //------------------------------------------------------------------------
                //Are there even any items to get
                if (typeof theFeed.feed.entry !== "undefined") {
                    //Make sure the item element is always an array
                    if (!Array.isArray(theFeed.feed.entry)) {
                        let newItem = [];
                        newItem[0] = theFeed.feed.entry;
                        theFeed.feed.entry = newItem;
                    }

                    //Items
                    let i = 0;
                    feedObj.items = [];
                    theFeed.feed.entry.forEach((item: any) => {
                        //console.log(item);

                        //Bail-out conditions
                        //-------------------
                        //Item id/guid missing
                        if (typeof item.id === "undefined" || item.id == "") {
                            return;
                        }
                        //No enclosures
                        let enclosures = findAtomItemEnclosures(item);
                        if (!Array.isArray(enclosures) || enclosures.length === 0) {
                            return;
                        }

                        //Set up the preliminary feed object properties
                        feedObj.items[i] = {
                            title: item.title,
                            link: "",
                            itunesEpisode: item['itunes:episode'],
                            itunesEpisodeType: item['itunes:episodeType'],
                            itunesExplicit: 0,
                            enclosure: enclosures[0],
                            pubDate: pubDateToTimestamp(item.updated),
                            guid: item.id,
                            description: item.content,
                            image: feedObj.image
                        }

                        //Item title
                        if (Array.isArray(feedObj.items[i].title)) {
                            feedObj.items[i].title = feedObj.items[i].title[0];
                        }
                        if (typeof feedObj.items[i].title === "object") {
                            if (typeof feedObj.items[i].title['#text'] !== "undefined") {
                                feedObj.items[i].title = feedObj.items[i].title['#text'];
                            }
                        }
                        if (typeof feedObj.items[i].title !== "string") {
                            feedObj.items[i].title = "";
                        }
                        if (typeof item['itunes:title'] === "string" && item['itunes:title'] != "") {
                            feedObj.items[i].title = item['itunes:title'];
                        }
                        feedObj.items[i].title = feedObj.items[i].title.trim();

                        //Item link
                        let itemLinks = findAtomItemAlternateLinks(item);
                        if (itemLinks && itemLinks.length > 0) {
                            feedObj.items[i].link = itemLinks[0];
                        }

                        //Item description
                        if (typeof item['itunes:summary'] === "string" && item['itunes:summary'] != "") {
                            feedObj.items[i].description = item['itunes:summary'];
                        }
                        if (typeof item.description !== "undefined" && item.description != "") {
                            if (typeof item.description['content:encoded'] === "string") {
                                feedObj.items[i].description = item.description['content:encoded'];
                            } else {
                                feedObj.items[i].description = item.description;
                            }
                        }
                        if (Array.isArray(item.content)) {
                            item.content = item.content[0];
                        }
                        if (typeof item.content === "object") {
                            if (typeof item.content['#text'] === "string") {
                                feedObj.items[i].description = item.content['#text'];
                            }
                        }
                        if (typeof feedObj.items[i].description === "string") {
                            feedObj.items[i].description = feedObj.items[i].description.trim();
                        } else {
                            feedObj.items[i].description = "";
                        }


                        //Itunes specific stuff
                        if (typeof item['itunes:explicit'] === "string" &&
                            (item['itunes:explicit'].toLowerCase() == "yes" || item['itunes:explicit'].toLowerCase() == "true")) {
                            feedObj.items[i].itunesExplicit = 1;
                        }
                        if (typeof item['itunes:explicit'] === "boolean" && item['itunes:explicit']) {
                            feedObj.items[i].itunesExplicit = 1;
                        }
                        if (typeof item['itunes:duration'] !== "undefined" && typeof item['itunes:duration'] === "string") {
                            feedObj.items[i].itunesDuration = timeToSeconds(item['itunes:duration']);
                            if (isNaN(feedObj.items[i].itunesDuration)) {
                                feedObj.items[i].itunesDuration = 0;
                            }
                        } else {
                            feedObj.items[i].itunesDuration = 0;
                        }
                        if (typeof feedObj.items[i].itunesEpisode === "string") {
                            feedObj.items[i].itunesEpisode = feedObj.items[i].itunesEpisode.replace(/\D/g, '');
                            if (feedObj.items[i].itunesEpisode != "") {
                                feedObj.items[i].itunesEpisode = parseInt(feedObj.items[i].itunesEpisode);
                            }
                        }
                        if (typeof feedObj.items[i].itunesEpisode !== "number") {
                            delete feedObj.items[i].itunesEpisode;
                        }

                        i++;
                    });

                    //Get the pubdate of the most recent item
                    let mostRecentPubDate = 0;
                    feedObj.items.forEach((item: any) => {
                        let thisPubDate = pubDateToTimestamp(item.updated);
                        if (thisPubDate > mostRecentPubDate && thisPubDate <= timestarted) {
                            mostRecentPubDate = thisPubDate;
                        }
                        if (checkone) console.log(item.updated + ": " + pubDateToTimestamp(item.updated));
                    });
                    feedObj.newestItemPubDate = mostRecentPubDate;

                    //Get the pubdate of the oldest item
                    let oldestPubDate = mostRecentPubDate;
                    feedObj.items.forEach((item: any) => {
                        let thisPubDate = pubDateToTimestamp(item.updated);
                        if (thisPubDate < oldestPubDate && thisPubDate > 0) {
                            oldestPubDate = thisPubDate;
                        }
                        if (checkone) console.log(item.updated + ": " + pubDateToTimestamp(item.updated));
                    });
                    feedObj.oldestItemPubDate = oldestPubDate;
                }

                if (ckoneurl) {
                    // console.log(theFeed);
                    // console.log(feedObj.image);
                    // console.log(feedObj.itunesImage);
                    console.log(feedObj.pubDate);
                }


                //Make sure we have a valid pubdate if possible
                if (typeof feedObj.pubDate === "undefined") {
                    if (typeof feedObj.lastBuildDate !== "undefined") {
                        feedObj.pubDate = feedObj.lastBuildDate;
                    } else {
                        feedObj.pubDate = 0;
                    }
                }
                if (typeof feedObj.pubDate === "string") {
                    feedObj.pubDate = pubDateToTimestamp(feedObj.pubDate);
                }

                //A format we don't support
            } else {
                feed.type = 9;
                markFeedAsUnparseable(feed);
                return;

            }

            //DEBUG
            if (ckoneurl) {
                //console.log(feedObj);
            }

            //Create a hash from some key, stable info in the feed
            feedObj.itemUrlStrings = "";
            let feedHash = crypto.createHash('md5').update(
                feedObj.title +
                feedObj.link +
                feedObj.language +
                feedObj.generator +
                feedObj.itunesAuthor +
                feedObj.itunesOwnerName +
                feedObj.itunesOwnerEmail +
                feedObj.itemUrlStrings
            ).digest("hex");

            //Add the items and enclosures we found if there was a newer feed item discovered, if the feed has zero items in the DB or if it's marked for immediate parse
            if ((feedObj.newestItemPubDate != feedObj.lastItemUpdateTime) || feed.itemcount == 0 || feed.parsenow > 0) {
                console.log('[' + feed.id + ' | ' + feed.title + ' | ' + feed.itemcount + '] Adding [' + feedObj.items.length + '] items...');

                //Note: This doesn't work because async
                //Purge all of the old items first
                // dbcalls++;
                // connection.query('UPDATE ' + config.tables.cg_table_newsfeed_items + ' SET `purge`='+config.partytime.cg_partytime_hostid+' WHERE feedid=?', [feed.id], function (err, result) {
                //     if (err) throw err;
                //     //console.log(result);
                //
                //     console.log("Done purging items.");
                //     dbcalls--;
                // });

                //--------------------------------------------------------------------------
                //-----------------ITEM PROCESSING INTO DB----------------------------------
                feedObj.items.forEach((item: any) => {
                    let enclosureUrl = sanitizeUrl(item.enclosure.url);

                    //Don't add an item if the enclosure url is not fully qualified
                    if (enclosureUrl.indexOf("http") !== 0) {
                        return;
                    }

                    if (item.itunesEpisode > 1000000) item.itunesEpisode = 1000000;
                    if (item.enclosure.length > 922337203685477580) item.enclosure.length = 0;

                    //Set a time in the feed obj to use as the "lastupdate" time
                    feedObj.lastUpdate = Math.floor(Date.now() / 1000);

                    feedObj.itemCount++;

                    //Assemble SQL
                    let sqlItemInsert = 'INSERT INTO ' + config.tables.cg_table_newsfeed_items + ' (' +
                        'feedid,' +
                        'title,' +
                        'link,' +
                        'description,' +
                        'guid,' +
                        'timestamp,' +
                        'timeadded,' +
                        'enclosure_url,' +
                        'enclosure_length,' +
                        'enclosure_type,' +
                        'itunes_episode,' +
                        'itunes_episode_type,' +
                        'itunes_explicit,' +
                        'itunes_duration,' +
                        'itunes_season,' +
                        '`purge`,' +
                        'image) ' +
                        'VALUES (?,?,?,?,?,?,UNIX_TIMESTAMP(now()),?,?,?,?,?,?,?,?,0,?)';
                    let sqlItemBind = [
                        feedObj.id,
                        truncateString(item.title, 1024),
                        sanitizeUrl(item.link),
                        item.description,
                        truncateString(item.guid, 740),
                        item.pubDate,
                        enclosureUrl,
                        item.enclosure.length,
                        truncateString(item.enclosure.type, 128),
                        item.itunesEpisode,
                        item.itunesEpisodeType,
                        item.itunesExplicit,
                        truncateInt(item.itunesDuration),
                        truncateInt(item.itunesSeason),
                        item.image
                    ];

                    //If the update flag was passed to the API then also overwrite existing items
                    if (feed.parsenow == 2) {
                        sqlItemInsert = sqlItemInsert + " ON DUPLICATE KEY UPDATE " +
                            "title = VALUES(title), " +
                            "link = VALUES(link), " +
                            "description = VALUES(description), " +
                            "enclosure_url = VALUES(enclosure_url), " +
                            "enclosure_length = VALUES(enclosure_length), " +
                            "enclosure_type = VALUES(enclosure_type), " +
                            "itunes_episode = VALUES(itunes_episode), " +
                            "itunes_episode_type = VALUES(itunes_episode_type), " +
                            "itunes_explicit = VALUES(itunes_explicit), " +
                            "itunes_duration = VALUES(itunes_duration), " +
                            "itunes_season = VALUES(itunes_season), " +
                            "image = VALUES(image) ";
                    }


                    dbcalls++;
                    //console.log("Adding item: ["+item.title+"|"+item.enclosure.url+"] to the database.");
                    connection.query(sqlItemInsert, sqlItemBind, function (err, result) {
                        if (err && err.code != 'ER_DUP_ENTRY') {
                            errorEncountered = true;
                            throw err;
                        }
                        if (typeof result !== "undefined" && result.affectedRows > 0) {
                            //console.log(result.affectedRows);
                            totalItemsAdded += result.affectedRows;
                        }
                        //Get the inserted item id
                        if (typeof result !== "undefined" && typeof result.insertId !== "undefined") {
                            let itemId = result.insertId;

                            //Transcripts
                            if (typeof item.podcastTranscripts !== "undefined") {
                                console.log(itemId + " - TRANSCRIPT");
                                insertsTranscripts += " (?,?,?),";
                                insertsTranscriptsBind.push(itemId);
                                insertsTranscriptsBind.push(item.podcastTranscripts.url);
                                insertsTranscriptsBind.push(item.podcastTranscripts.type);
                            }

                            //Chapters
                            if (typeof item.podcastChapters !== "undefined") {
                                console.log(itemId + " - CHAPTER");
                                insertsChapters += " (?,?,?),";
                                insertsChaptersBind.push(itemId);
                                insertsChaptersBind.push(item.podcastChapters.url);
                                insertsChaptersBind.push(item.podcastChapters.type);
                            }

                            //Soundbites
                            if (typeof item.podcastSoundbites === "object" && Array.isArray(item.podcastSoundbites)) {
                                item.podcastSoundbites.forEach(function (soundbite: { title: any; startTime: any; duration: any; }, _index: any, _array: any) {
                                    console.log(itemId + " - SOUNDBITE");
                                    insertsSoundbites += " (?,?,?,?),";
                                    insertsSoundbitesBind.push(itemId);
                                    insertsSoundbitesBind.push(soundbite.title);
                                    insertsSoundbitesBind.push(soundbite.startTime);
                                    insertsSoundbitesBind.push(soundbite.duration);
                                });
                            } else if (typeof item.podcastSoundbites === "object") {
                                console.log(itemId + " - SOUNDBITE");
                                insertsSoundbites += " (?,?,?,?),";
                                insertsSoundbitesBind.push(itemId);
                                insertsSoundbitesBind.push(item.podcastSoundbites.title);
                                insertsSoundbitesBind.push(item.podcastSoundbites.startTime);
                                insertsSoundbitesBind.push(item.podcastSoundbites.duration);
                            }
                        }
                        dbcalls--;
                    });
                });
                //-----------------ITEM PROCESSING INTO DB----------------------------------
                //--------------------------------------------------------------------------

                //Category updates
                if (Array.isArray(feedObj.categories) && feedObj.categories.length > 0) {
                    insertCategories(feedObj.id, feedObj.categories);
                }

                //Pubsub updates
                if ((typeof feedObj.pubsub.hub === "string" && feedObj.pubsub.hub.indexOf('http') === 0) &&
                    (typeof feedObj.pubsub.self === "string" && feedObj.pubsub.self.indexOf('http') === 0)
                ) {
                    //console.log("Pubsub: " + feedObj.id + " - "+feedObj.pubsub.hub+" -> " + feedObj.pubsub.self);
                    insertsPubsub += " (?,?,?),";
                    insertsPubsubBind.push(feedObj.id);
                    insertsPubsubBind.push(feedObj.pubsub.hub);
                    insertsPubsubBind.push(feedObj.pubsub.self);
                }
            }

            //Debug
            if (ckoneurl) {
                // console.log(theFeed);
                // console.log(feedObj.image);
                // console.log(feedObj.itunesImage);
                console.log(feedObj.pubDate);
            }

            //Update the feed record with what we discovered
            if (!errorEncountered) {
                if (feedObj.newestItemPubDate != feedObj.lastItemUpdateTime) {
                    feedObj.updateFrequency = calculateDays(feedObj.newestItemPubDate, feedObj.lastItemUpdateTime);
                    //console.log(feedObj.id + ' : ' + feedObj.newestItemPubDate + ' - ' + feedObj.lastItemUpdateTime);
                }

                //Set a decent timestamp for 'lastupdate' if one is set in the feedobj
                let lastupdate_clause = "";
                if (typeof feedObj.lastUpdate !== "undefined") {
                    console.log(feedObj.lastUpdate);
                    lastupdate_clause = 'lastupdate=' + feedObj.lastUpdate + ',';
                }

                dbcalls++;
                //console.log("Updating feed: ["+feedObj.id+" | "+feedObj.url+"] in the database.");
                connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET ' +
                    'content="",' +
                    'type=?,' +
                    'generator=?,' +
                    'title=?,' +
                    lastupdate_clause +
                    'link=?,' +
                    'description=?,' +
                    'itunes_author=?,' +
                    'itunes_owner_name=?,' +
                    'itunes_owner_email=?,' +
                    'itunes_new_feed_url=?,' +
                    'explicit=?,' +
                    'image=?,' +
                    'artwork_url_600=?,' +
                    'itunes_type=?,' +
                    'itunes_id=?,' +
                    'parse_errors=0,' +
                    'updated=0,' +
                    'lastparse=UNIX_TIMESTAMP(now()), ' +
                    'parsenow=0,' +
                    'newest_item_pubdate=?,' +
                    'update_frequency=?,' +
                    'language=?,' +
                    'chash=?,' +
                    'oldest_item_pubdate=?,' +
                    'item_count=?,' +
                    'podcast_locked=?,' +
                    'podcast_owner=? ' +
                    'WHERE id=?', [
                    feedObj.type,
                    feedObj.generator,
                    truncateString(feedObj.title, 768),
                    sanitizeUrl(feedObj.link),
                    feedObj.description,
                    feedObj.itunesAuthor,
                    feedObj.itunesOwnerName,
                    feedObj.itunesOwnerEmail,
                    sanitizeUrl(feedObj.itunesNewFeedUrl),
                    feedObj.explicit,
                    sanitizeUrl(feedObj.image),
                    sanitizeUrl(feedObj.itunesImage),
                    feedObj.itunesType,
                    feedObj.itunesId,
                    truncateInt(feedObj.newestItemPubDate),
                    feedObj.updateFrequency,
                    truncateString(feedObj.language, 8),
                    feedHash,
                    truncateInt(feedObj.oldestItemPubDate),
                    truncateInt(feedObj.itemCount),
                    feedObj.podcastLocked,
                    truncateString(feedObj.podcastOwner, 255),
                    feedObj.id
                ], function (err, result) {
                    if (err) throw err;
                    if (result.affectedRows === 0) console.log("Error updating feed record for feed: [" + feed.url + "]");

                    dbcalls--;
                });

            }

        } else {
            //Error parsing feed
            console.log("Error parsing feed.");
            console.log(parsedContent);
            //process.exit(1);

            //Update the feed record with what we discovered
            dbcalls++;
            console.log("Updating error feed: [" + feedObj.id + " | " + feedObj.url + "] in the database.");
            connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET ' +
                'content="", ' +
                'itunes_id=?,' +
                'updated=0,' +
                'parse_errors=parse_errors+1,' +
                'parsenow=0 ' +
                'WHERE id=?', [
                feedObj.itunesId,
                feedObj.id
            ], function (err, result) {
                if (err) throw err;
                if (result.affectedRows === 0) console.log("Error updating feed record for feed: [" + feed.url + "]");

                dbcalls--;
            });

        }

        feedWorkCount++;
        //DEBUG: Break here when testing
        //break;
    })
});
dbcalls--;


//Main logging function
function loggit(lognum: number, message: string) {
    //Timestamp for this log
    let tstamp = new Date(Date.now()).toLocaleString();
    let fd;

    //Open the file
    switch (lognum) {
        case 1:
            if (config.logging.log_errors_only == 1) {
                return true;
            }
            fd = fs.createWriteStream(paths.logs + config.folders.cg_log + '/' + config.logging.cg_acclog, {'flags': 'a'});
            break;
        case 2:
            fd = fs.createWriteStream(paths.logs + config.folders.cg_log + '/' + config.logging.cg_errlog, {'flags': 'a'});
            break;
        case 3:
            fd = fs.createWriteStream(paths.logs + config.folders.cg_log + '/' + config.logging.cg_dbglog, {'flags': 'a'});
            break;
    }

    //Write the message
    fd?.end("[" + tstamp + "] [LOCAL] (" + __filename + ") " + message + "\n");

    //Return
    return true;
}


const dbcheck = setInterval(function () {
    console.log("--- Still: [" + dbcalls + "] database calls and: [" + netcalls + "] network requests. Feed count: [" + feedcount + "]. Netwait: [" + netwait + "].")
    if (stillWaitingForDB && waitingForDBCount == 0) {
        connection.end();
        console.log("Error - Partytime is exiting.  The database query never returned a list of feeds.");
        loggit(3, "DEBUG: Error - Partytime is exiting.  The database query never returned a list of feeds.");
        process.exit(1);
    }
    if (stillWaitingForDB) {
        waitingForDBCount--;
        return true;
    }
    if (dbcalls === 0 && (netcalls === 0 || netwait === 0)) {
        //Update the category mapping for the feeds we processed
        if (insertsCatmap != "") {
            if (insertsCatmap.substring(insertsCatmap.length - 1) == ",") {
                insertsCatmap = insertsCatmap.slice(0, -1);
            }
            dbcalls++;
            let sqlStatement = stmtPreCatmap + insertsCatmap + stmtPostCatmap;
            console.log(sqlStatement);
            connection.query(sqlStatement, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsCatmap = "";

                dbcalls--;
            });
        }

        //Update the pubsub entries for the feeds we processed
        if (insertsPubsub != "") {
            if (insertsPubsub.substring(insertsPubsub.length - 1) == ",") {
                insertsPubsub = insertsPubsub.slice(0, -1);
            }

            let sqlStatementPS = stmtPrePubsub + insertsPubsub + stmtPostPubsub;
            console.log(sqlStatementPS);

            dbcalls++;
            connection.query(sqlStatementPS, insertsPubsubBind, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsPubsub = "";

                dbcalls--;
            });
        }

        //Update the item chapters table
        if (insertsChapters != "") {
            if (insertsChapters.substring(insertsChapters.length - 1) == ",") {
                insertsChapters = insertsChapters.slice(0, -1);
            }

            let sqlStatementChapters = stmtPreChapters + insertsChapters + stmtPostChapters;
            console.log(sqlStatementChapters);

            dbcalls++;
            connection.query(sqlStatementChapters, insertsChaptersBind, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsChapters = "";

                dbcalls--;
            });
        }

        //Update the item soundbites table
        if (insertsSoundbites != "") {
            if (insertsSoundbites.substring(insertsSoundbites.length - 1) == ",") {
                insertsSoundbites = insertsSoundbites.slice(0, -1);
            }

            let sqlStatementSoundbites = stmtPreSoundbites + insertsSoundbites + stmtPostSoundbites;
            console.log(sqlStatementSoundbites);

            dbcalls++;
            connection.query(sqlStatementSoundbites, insertsSoundbitesBind, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsSoundbites = "";

                dbcalls--;
            });
        }

        //Update the item transcript table
        console.log(insertsTranscripts);
        if (insertsTranscripts != "") {
            if (insertsTranscripts.substring(insertsTranscripts.length - 1) == ",") {
                insertsTranscripts = insertsTranscripts.slice(0, -1);
            }

            let sqlStatementTranscripts = stmtPreTranscripts + insertsTranscripts + stmtPostTranscripts;
            console.log(sqlStatementTranscripts);

            dbcalls++;
            connection.query(sqlStatementTranscripts, insertsTranscriptsBind, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsTranscripts = "";

                dbcalls--;
            });
        }

        //Update the value block if one existed
        if (insertsValue != "") {
            if (insertsValue.substring(insertsValue.length - 1) == ",") {
                insertsValue = insertsValue.slice(0, -1);
            }

            let sqlStatementValue = stmtPreValue + insertsValue + stmtPostValue;
            console.log(sqlStatementValue);

            dbcalls++;
            connection.query(sqlStatementValue, insertsValueBind, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsValue = "";

                dbcalls--;
            });
        }

        //Update the funding if one existed
        if (insertsFunding != "") {
            if (insertsFunding.substring(insertsFunding.length - 1) == ",") {
                insertsFunding = insertsFunding.slice(0, -1);
            }

            let sqlStatementFunding = stmtPreFunding + insertsFunding + stmtPostFunding;
            console.log(sqlStatementFunding);

            dbcalls++;
            connection.query(sqlStatementFunding, insertsFundingBind, function (err, _result) {
                if (err && err.code != 'ER_DUP_ENTRY') {
                    throw err;
                }

                insertsFunding = "";

                dbcalls--;
            });
        }

        if (dbcalls === 0) {
            console.log("Partytime finished running. Processed: [" + totalItemsAdded + "] items in: [" + feedWorkCount + "] feeds in: [" + (now() - timestarted) + "] seconds.");
            loggit(3, "DEBUG: Partytime finished running. Processed: [" + totalItemsAdded + "] items in: [" + feedWorkCount + "] feeds in: [" + (now() - timestarted) + "] seconds.");
            process.exit(0);
        }

        //Disabled: This depends on pre-marking feed items for removal
        //Now anything left over for this feed that still has purge set can be removed
        // dbcalls++;
        // connection.query('DELETE FROM ' + config.tables.cg_table_newsfeed_items + ' WHERE `purge`=?', [config.partytime.cg_partytime_hostid], function (err, result) {
        //     if (err) throw err;
        //     console.log("Purged: ["+result.affectedRows+"] rows from nfitems table.");
        //     connection.end();
        //     dbcalls--;
        // });
    }
    if (dbcalls === 0) {
        loggit(3, "DEBUG: Partytime still running. Processed: [" + totalItemsAdded + "] items in: [" + feedWorkCount + "] feeds in: [" + (now() - timestarted) + "] seconds so far.");
        netwait--;
    }
    if (dbcalls > 0) {
        loggit(3, "DEBUG: Partytime still running. Processed: [" + totalItemsAdded + "] items in: [" + feedWorkCount + "] feeds in: [" + (now() - timestarted) + "] seconds so far.");
        netwait = 30;
    }
}, 5000);


//RFC date convert to unix epoch
function pubDateToTimestamp(pubDate: number | string) {
    if (typeof pubDate === "number") {
        return pubDate;
    }

    let date = new Date(pubDate);
    let pubDateParsed = Math.round(date.getTime() / 1000);

    if (isNaN(pubDateParsed)) {
        return 0;
    }

    return pubDateParsed;
}


//Get a mime-type string for an unknown media enclosure
function guessEnclosureType(url: string) {
    if (url.indexOf('.m4v') != -1) {
        return "video/mp4";
    }
    if (url.indexOf('.mp4') != -1) {
        return "video/mp4";
    }
    if (url.indexOf('.avi') != -1) {
        return "video/avi";
    }
    if (url.indexOf('.mov') != -1) {
        return "video/quicktime";
    }
    if (url.indexOf('.mp3') != -1) {
        return "audio/mpeg";
    }
    if (url.indexOf('.m4a') != -1) {
        return "audio/mp4";
    }
    if (url.indexOf('.wav') != -1) {
        return "audio/wav";
    }
    if (url.indexOf('.ogg') != -1) {
        return "audio/ogg";
    }
    if (url.indexOf('.wmv') != -1) {
        return "video/x-ms-wmv";
    }

    return "";
}


//Parse out all of the links from an atom entry and see which ones are enclosures
function findAtomItemEnclosures(entry: { link: any[]; }) {
    let enclosures: {}[] = [];

    //Multiple link objects in an array?
    if (Array.isArray(entry.link)) {

        let idx = 0;
        entry.link.forEach((item: any) => {
            let enclosure = {} as any;

            //console.log(item);
            if (typeof item.attr !== "object") return;

            if (typeof item.attr['@_rel'] === "string") {
                if (item.attr['@_rel'] !== "enclosure") return;

                //Set the url
                if (typeof item.attr['@_href'] !== "string") return;
                if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;
                enclosure.url = item.attr['@_href'];

                //Set the length
                enclosure.length = 0;
                if (typeof item.attr['@_length'] === "string") {
                    enclosure.length = parseInt(item.attr['@_length']);
                }
                if (typeof item.attr['@_length'] === "number") {
                    enclosure.length = item.attr['@_length'];
                }
                if (isNaN(enclosure.length) || typeof enclosure.length === "undefined") {
                    enclosure.length = 0;
                }

                //Set the type
                enclosure.type = "";
                if (typeof item.attr['@_type'] === "string") {
                    enclosure.type = item.attr['@_type'];
                }
                if (typeof enclosure.type === "undefined" || enclosure.type === "") {
                    enclosure.type = guessEnclosureType(enclosure.url);
                }

                //We have a valid enclosure at this point, so push onto the array
                enclosures.push(enclosure);
            }
        });

        return enclosures;
    }

    //Just a straight object
    if (typeof entry.link === "object") {
        let item = entry.link as any;
        let enclosure = {} as any;

        //console.log(item);

        if (item.attr['@_rel'] !== "enclosure") return;

        //Set the url
        if (typeof item.attr['@_href'] !== "string") return;
        if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;
        enclosure.url = item.attr['@_href'];

        //Set the length
        enclosure.length = 0;
        if (typeof item.attr['@_length'] === "string") {
            enclosure.length = parseInt(item.attr['@_length']);
        }
        if (typeof item.attr['@_length'] === "number") {
            enclosure.length = item.attr['@_length'];
        }
        if (isNaN(enclosure.length) || typeof enclosure.length === "undefined") {
            enclosure.length = 0;
        }

        //Set the type
        enclosure.type = "";
        if (typeof item.attr['@_type'] === "string") {
            enclosure.type = item.attr['@_type'];
        }
        if (typeof enclosure.type === "undefined" || enclosure.type === "") {
            enclosure.type = guessEnclosureType(enclosure.url);
        }

        //We have a valid enclosure at this point, so push onto the array
        enclosures.push(enclosure);
    }

    return enclosures;
}


//Parse out all of the links from an atom entry and see which ones are WebSub links
function findPubSubLinks(channel: { [x: string]: any[]; link: any[]; }) {
    let pubsublinks = {
        hub: "",
        self: ""
    };

    //Multiple link objects in an array?
    if (Array.isArray(channel.link)) {
        let idx = 0;
        channel.link.forEach((item: any) => {

            //console.log(item);
            if (typeof item.attr !== "object") return;

            if (typeof item.attr['@_rel'] === "string") {
                if (item.attr['@_rel'] === "hub") {
                    //console.log(item);

                    //Set the url
                    if (typeof item.attr['@_href'] !== "string") return;
                    if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;

                    pubsublinks.hub = item.attr['@_href'];
                }

                if (item.attr['@_rel'] === "self") {
                    //console.log(item);

                    //Set the url
                    if (typeof item.attr['@_href'] !== "string") return;
                    if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;

                    pubsublinks.self = item.attr['@_href'];
                }
            }
        });
    }

    //Multiple link objects in an array?
    if (Array.isArray(channel['atom:link'])) {
        let idx = 0;
        channel['atom:link'].forEach((item: any) => {

            //console.log(item);
            if (typeof item.attr !== "object") return;

            if (typeof item.attr['@_rel'] === "string") {
                if (item.attr['@_rel'] === "hub") {
                    //console.log(item);

                    //Set the url
                    if (typeof item.attr['@_href'] !== "string") return;
                    if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;

                    pubsublinks.hub = item.attr['@_href'];
                }

                if (item.attr['@_rel'] === "self") {
                    //console.log(item);

                    //Set the url
                    if (typeof item.attr['@_href'] !== "string") return;
                    if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;

                    pubsublinks.self = item.attr['@_href'];
                }
            }
        });
    }

    if (pubsublinks.hub === "" || pubsublinks.self === "") {
        return false;
    }

    return pubsublinks;
}


//Parse out all of the links from an atom entry and see which ones are alternates
function findAtomItemAlternateLinks(entry: { link: any[]; }) {
    let alternates: string[] = [];

    //Multiple link objects in an array?
    if (Array.isArray(entry.link)) {

        let idx = 0;
        entry.link.forEach((item: any) => {

            //console.log(item);
            if (typeof item.attr !== "object") return;

            if (typeof item.attr['@_rel'] === "string") {
                if (item.attr['@_rel'] !== "alternate") return;

                //Set the url
                if (typeof item.attr['@_href'] !== "string") return;
                if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;

                //Push this url on the array
                alternates.push(item.attr['@_href']);
            }
        });

        return alternates;
    }

    //Just a straight object
    if (typeof entry.link === "object") {
        let item = entry.link as any;

        //console.log(item);
        if (typeof item.attr !== "object") return;

        if (typeof item.attr['@_rel'] === "string") {
            if (item.attr['@_rel'] !== "alternate") return;

            //Set the url
            if (typeof item.attr['@_href'] !== "string") return;
            if (typeof item.attr['@_href'] === "string" && item.attr['@_href'] === "") return;

            //Push this url on the array
            alternates.push(item.attr['@_href']);
        }
    }

    return alternates;
}


//Test for non-latin
function containsNonLatinCodepoints(s: string) {
    if (/[^\x00-\x80]/.test(s)) return true;
    return /[^\u0000-\u00ff]/.test(s);
}


//Make the url safe for storing
function sanitizeUrl(url: string) {
    let newUrl = "";

    if (typeof url !== "string") return "";

    if (containsNonLatinCodepoints(url)) {
        newUrl = encodeURI(url).substring(0, 768);
        if (typeof newUrl !== "string") return "";

        if (containsNonLatinCodepoints(newUrl)) {
            newUrl = newUrl.replace(/[^\x00-\x80]/gi, " ");
        }

        return newUrl.substring(0, 768);
    }

    newUrl = url.substring(0, 768);
    if (typeof newUrl !== "string") return "";
    return newUrl;
}


//Reset a feed back to nothing
function markFeedAsUnparseable(feed: { id: string; url: string; type: any; itunesId: any; }) {
    dbcalls++;
    console.log("Marking feed: [" + feed.id + " | " + feed.url + "] as unparseable in the database.");
    connection.query('UPDATE ' + config.tables.cg_table_newsfeeds + ' SET ' +
        'content="",' +
        'type=?,' +
        'generator="",' +
        'title="",' +
        'link="",' +
        'description="",' +
        'itunes_author="",' +
        'itunes_owner_name="",' +
        'itunes_owner_email="",' +
        'itunes_new_feed_url="",' +
        'explicit=0,' +
        'image="",' +
        'itunes_type="",' +
        'itunes_id=?,' +
        'updated=0, ' +
        'parsenow=0 ' +
        'WHERE id=?', [
        feed.type,
        feed.itunesId,
        feed.id
    ], function (err, result) {
        if (err) throw err;
        if (result.affectedRows === 0) console.log("Error updating unparseable feed record for feed: [" + feed.url + "]");
        dbcalls--;
    });

    return;
}


//DB Safety: Make sure a string isn't too long
function truncateString(s: string, length: number | undefined) {
    if (typeof s !== "string") return "";
    if (typeof s.substring !== "function") return "";
    return s.substring(0, length);
}


//DB Safety: Make sure a number isn't out of range
function truncateInt(number: any) {
    let newNumber = parseInt(number);
    if (newNumber > 2147483647) {
        return 2147483647;
    }
    if (newNumber < -2147483647) {
        return -2147483647;
    }
    if (isNaN(newNumber)) return 0;
    return newNumber;
}


//Read in the feed file
function readFeedFile(feedId: string) {
    try {
        let data = fs.readFileSync(paths.feeds + feedId + '.txt', 'utf8');
        return data;
    } catch (err) {
        console.error(err);
        return "";
    }
}


//Delete a feed file
function deleteFeedFile(feedId: string) {
    try {
        fs.unlinkSync(paths.feeds + feedId + '.txt');
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}


//Does a feed file exist?
function feedFileExists(feedId: string) {
    return fs.existsSync(paths.feeds + feedId + '.txt');
}


//Figure out the interval between two time stamps and return an int as an update frequency marker
function calculateDays(newItemTime: number, oldItemTime: number) {
    let diffSeconds = newItemTime - oldItemTime;

    if (diffSeconds < 0) return 9;
    if (diffSeconds < 108000) return 1; //30 hours
    if (diffSeconds < 259200) return 2; //3 days
    if (diffSeconds < 864000) return 3; //10 days
    if (diffSeconds < 1728000) return 4; //20 days
    if (diffSeconds < 3456000) return 5; //40 days
    if (diffSeconds < 7776000) return 6; //90 days
    if (diffSeconds < 17280000) return 7; //200 days
    if (diffSeconds < 31536000) return 8; //365 days
    return 0;
}


//Determine categories list and update the database to reflect
function insertCategories(feedId: string, feedCategories: string[]) {
    //Static map of ids to save a db lookup (all lowercase)
    let catlookup = ['', 'arts', 'books', 'design', 'fashion', 'beauty', 'food', 'performing', 'visual', 'business', 'careers', 'entrepreneurship', 'investing',
        'management', 'marketing', 'nonprofit', 'comedy', 'interviews', 'improv', 'standup', 'education', 'courses', 'howto', 'language',
        'learning', 'selfimprovement', 'fiction', 'drama', 'history', 'health', 'fitness', 'alternative', 'medicine', 'mental', 'nutrition',
        'sexuality', 'kids', 'family', 'parenting', 'pets', 'animals', 'stories', 'leisure', 'animation', 'manga', 'automotive', 'aviation', 'crafts',
        'games', 'hobbies', 'home', 'garden', 'videogames', 'music', 'commentary', 'news', 'daily', 'entertainment', 'government', 'politics',
        'buddhism', 'christianity', 'hinduism', 'islam', 'judaism', 'religion', 'spirituality', 'science', 'astronomy', 'chemistry', 'earth', 'life',
        'mathematics', 'natural', 'nature', 'physics', 'social', 'society', 'culture', 'documentary', 'personal', 'journals', 'philosophy', 'places',
        'travel', 'relationships', 'sports', 'baseball', 'basketball', 'cricket', 'fantasy', 'football', 'golf', 'hockey', 'rugby', 'running', 'soccer',
        'swimming', 'tennis', 'volleyball', 'wilderness', 'wrestling', 'technology', 'truecrime', 'tv', 'film', 'aftershows', 'reviews'];
    let max = 8;
    let catCount = 0;
    let arrCategories = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    //Do compound categories
    if (feedCategories.indexOf('video') > -1 && feedCategories.indexOf('games') > -1) {
        feedCategories.push('videogames');
    }
    if (feedCategories.indexOf('true') > -1 && feedCategories.indexOf('crime') > -1) {
        feedCategories.push('truecrime');
    }
    if (feedCategories.indexOf('after') > -1 && feedCategories.indexOf('shows') > -1) {
        feedCategories.push('aftershows');
    }
    if (feedCategories.indexOf('self') > -1 && feedCategories.indexOf('improvement') > -1) {
        feedCategories.push('selfimprovement');
    }
    if (feedCategories.indexOf('how') > -1 && feedCategories.indexOf('to') > -1) {
        feedCategories.push('howto');
    }

    //console.log(feedCategories);

    //Index lookup
    feedCategories.forEach(function (item: string, index: number, _array: any) {
        if (index >= max) return;

        let cat = catlookup.indexOf(item.replace(' ', '').replace('-', ''));

        if (cat > 0) {
            arrCategories[catCount + 1] = cat;
            catCount++;
        }
    });

    if (catCount > 0) {
        //console.log(arrCategories);
        insertsCatmap += "(" + feedId + "," + arrCategories[1] + "," + arrCategories[2] + "," + arrCategories[3] + "," + arrCategories[4] + "," + arrCategories[5] + "," +
            arrCategories[6] + "," + arrCategories[7] + "," + arrCategories[8] + "," + arrCategories[9] + "," + arrCategories[10] + "),";
    }
}


/*
* Convert time string to seconds
* 01:02 = 62 seconds
* Thanks to Glenn Bennett!
*/
function timeToSeconds(timeString: string) {
    let seconds = 0;
    let a = timeString.split(':');

    switch (a.length - 1) {
        case 1:
            seconds = ((+a[0]) * 60 + (+a[1]));
            break;

        case 2:
            seconds = ((+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]));
            break;

        default:
            if (timeString != '')
                seconds = parseInt(timeString);
    }

    // Sometime we get an unparseable value which results in a Nan, in this case return
    // a default of 30 minutes
    if (isNaN(seconds)) {
        seconds = 30 * 60;
    }

    return seconds;
}
