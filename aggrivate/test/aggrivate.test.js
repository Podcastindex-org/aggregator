const path = require('path');
const dbHelper = require('./helpers/dbHelper');
const ini = require('ini');
const fs = require('graceful-fs');
const processHelper = require('./helpers/processHelper');
const serverHelper = require('./helpers/serverHelper');
const configHelper = require('./helpers/configHelper');
const tmp = require('tmp');
const process = require('process');

jest.setTimeout(10000);
const testConfigPath = path.join(__dirname, 'test.conf');
const defaultTestConfig = ini.parse(fs.readFileSync(testConfigPath, 'utf-8'));

function unixTimestamp() {
    return Math.floor(Date.now() / 1000)
}

function getFeedsProcessLog(feedsProcessed) {
    return `Aggrivate finished running. Processed: [${feedsProcessed}] feeds`;
}

function runAggrivate(configPath) {
    const path = configPath || testConfigPath;
    return processHelper.execute('aggrivate.js', ['--config', path]);
}

function assertIsBetween(value, min, max) {
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThan(max);
}

describe('Given a valid config file path', () => {
    let tmpConfigPath;
    let testConfig;

    beforeAll(() => {
        testConfig = { ...defaultTestConfig };
        testConfig.folders.cg_log = `${tmp.dirSync().name}/`;
        testConfig.folders.feeds = `${tmp.dirSync().name}/`;
        tmpConfigPath = 'integrationtest.conf';
        testConfig.database = {
            cg_dbhost: process.env.MYSQL_HOST,
            cg_dbuser: process.env.MYSQL_USER,
            cg_dbpass: process.env.MYSQL_PASSWORD,
            cg_dbname: process.env.MYSQL_DATABASE,
        };

        configHelper.writeConfigFile(tmpConfigPath, testConfig);
    });

    afterAll(async () => {
        fs.unlinkSync(tmpConfigPath);
    });

    describe('When there are 0 feeds to pull', () => {
        test('Returns successfully with 0 feeds processed', async () => {
            expect.assertions(1);
            const response = await runAggrivate(tmpConfigPath);
            expect(response).toMatch(getFeedsProcessLog(0));
        });
    });

    describe('When there is a feed with the pull now flag set in the database', () => {
        let db;
        let feedsPath;
        let response;
        let feedId;
        let rssServer;

        let beforeRunTimestamp;
        let afterRunTimestamp;
        const feedName = 'pc20rss.xml';
        let feedHelper;

        beforeAll(async () => {
            feedsPath = testConfig.folders.feeds;

            const databaseConfig = testConfig.database;
            db = await dbHelper.connectToDB(databaseConfig.cg_dbhost, databaseConfig.cg_dbuser, databaseConfig.cg_dbpass, databaseConfig.cg_dbname);
            feedHelper = new dbHelper.NewsFeedHelper(db, testConfig.tables.cg_table_newsfeeds);

            rssServer = serverHelper.serveRSS();
            const rssServerPort = rssServer.address().port;
            const feed = {
                url: `http://localhost:${rssServerPort}/${feedName}`,
                pullnow: 1,
            };

            const result = await feedHelper.createFeed(feed);
            feedId = result.insertId;

            beforeRunTimestamp = unixTimestamp();
            response = await runAggrivate(tmpConfigPath);
            afterRunTimestamp = unixTimestamp();
        });

        afterAll(async () => {
            await feedHelper.clearNewsFeedTable(db);
            db.end();
            rssServer.close();
        });

        test('Returns successfully with 1 feed processed', async () => {
            expect(response).toMatch(getFeedsProcessLog(1));
        });

        test('Updates the feed record', async () => {
            const updatedFeedRecord = await feedHelper.getFeed(feedId, db);

            const rssFeedMd5Hash = '64816de6eb4bb71b33b52a60e409bf60';
            expect(updatedFeedRecord).toEqual(expect.objectContaining({
                pullnow: 0,
                lasthttpstatus: 200,
                updated: 1,
                contenttype: 'application/xml',
                contenthash: rssFeedMd5Hash,
            }));

            assertIsBetween(updatedFeedRecord.lastcheck, beforeRunTimestamp, afterRunTimestamp);
            assertIsBetween(updatedFeedRecord.lastgoodhttpstatus, beforeRunTimestamp, afterRunTimestamp);
            assertIsBetween(updatedFeedRecord.lastmod, beforeRunTimestamp, afterRunTimestamp);
        });

        test('Downloads feed into feed directory', () => {
            const expectedFeedFilename = path.join(feedsPath, '1.txt');
            expect(fs.existsSync(expectedFeedFilename)).toEqual(true);

            const originalFeedFile = fs.readFileSync(path.join(__dirname, `rss/${feedName}`));
            const downloadedFeedFile = fs.readFileSync(expectedFeedFilename);
            expect(originalFeedFile.equals(downloadedFeedFile)).toEqual(true);
        });
    });
});

test('Returns error with invalid config path', async () => {
    await expect(runAggrivate('pathtoconfigthatdoesnotexist.conf')).rejects.toBeDefined();
});
