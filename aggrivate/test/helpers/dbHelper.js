var mysql = require('mysql');

async function connectToDB(host, user, password, database) {
    const connection = mysql.createConnection({
        host,
        user,
        password,
        database,
        charset: 'utf8mb4'
    });
    return new Promise((resolve, reject) => {
        connection.connect(function (err) {
            if (err) {
                reject(err);
            }

            resolve(connection);
        });
    })
}

class NewsFeedHelper  {
    constructor(db, tableName) {
        this.db = db;
        this.tableName = tableName;
    }

    async createFeed(feed) {
        const feedRecord = {
            title: 'Test feed',
            content: '',
            description: '',
            ...feed,
        }
        return new Promise((resolve, reject) => {
            this.db.query(`INSERT INTO ${this.tableName} SET ?`, feedRecord, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    getFeed(id) {
        return new Promise((resolve, reject) => {
            this.db.query(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id], (error, results) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(results[0]);
                }
            });
        });
    }
    
    clearNewsFeedTable() {
        return new Promise((resolve, reject) => {
            this.db.query(`TRUNCATE TABLE ${this.tableName}`, (error) => {
                if (error) {
                    reject(error);
                }
                resolve();
            });
        });
    }
}

exports.connectToDB = connectToDB;
exports.NewsFeedHelper = NewsFeedHelper;

