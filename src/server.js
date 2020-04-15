var app,
    util            = require('util'),
    cluster         = require('cluster'),
    express         = require('express'),
    ejs             = require('ejs'),
    winston         = require('winston'),
    async           = require('async'),
    mysql           = require('mysql'),
    mongoose        = require('mongoose'),
    redis           = require('redis');

var defs            = require('./defs'),
    envConfig       = require('config'),
    CFG_SERVER      = envConfig.server,
    CFG_DB_MYSQL    = envConfig.dbMysql,
    CFG_DB_MONGO    = envConfig.dbMongo,
    CFG_STORE_REDIS = envConfig.storeRedis;

var port            = process.env.PORT || CFG_SERVER.port,
    forks           = process.env.FORKS || CFG_SERVER.forks;

process.addListener('uncaughtException', function (err, stack) {
    var message = 'Caught exception: ' + err + '\n' + err.stack;
    if (app && app.logmessage) {
        app.logmessage(message);
    } else {
        console.log(message);
    }
});

var logmessage = function(message) {
    message = '#' + (process.env.NODE_WORKER_ID ? process.env.NODE_WORKER_ID : 'M') + ': ' + message;
    if (winston) {
        winston.log('info', message);
    } else {
        console.log(message);
    }
}

var app = express.createServer();
app.configure(function() {
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.set('view engine', 'ejs');
    app.set('view options', { 
        layout: false 
    });
});

app.envConfig = envConfig;
app.defs = defs;
app.logmessage = logmessage;

if (process.env.NODE_WORKER_ID) {
        async.parallel({
        mysqlConnection: function(cb1) {
            if (CFG_DB_MYSQL) {
                var mysqlConfig = {
                    host: CFG_DB_MYSQL.host,
                    port: CFG_DB_MYSQL.port,
                    user: CFG_DB_MYSQL.username,
                    password: CFG_DB_MYSQL.password,
                    database: CFG_DB_MYSQL.dbname
                };
                logmessage('MySQL config: ' + JSON.stringify(mysqlConfig));
                var mysqlClient = mysql.createClient(mysqlConfig);
                cb1(null, mysqlClient);
            } else {
                cb1(null, null);
            }
        },
        mongoConnection: function(cb2) {
           
            if (CFG_DB_MONGO) {
                var mongoURI = 'mongodb://' + CFG_DB_MONGO.username + ':' + CFG_DB_MONGO.password + '@' + CFG_DB_MONGO.host + ':' + CFG_DB_MONGO.port + '/' + CFG_DB_MONGO.dbname;
                logmessage('MongoDB config: ' + mongoURI);
                var mongoClient = mongoose.createConnection(mongoURI);
                cb2(null, mongoClient);
            } else {
                cb2(null, null);
            }
        },
        redisConnection: function(cb3) {
           
            if (CFG_STORE_REDIS) {
                var redisClient = redis.createClient(CFG_STORE_REDIS.port, CFG_STORE_REDIS.host); 
                redisClient.auth(CFG_STORE_REDIS.password, function() {
                    redisClient.select(CFG_STORE_REDIS.dbname, function(err,res) {
                        logmessage('Redis config: ' + redisClient.host + ':' + redisClient.port + ' @ ' + redisClient.selected_db + ' with ' + redisClient.auth_pass);
                        cb3(null, redisClient);
                    });
                });
            } else {
                cb3(null, null);
            }
        },
    },
      function(err, results) {
        logmessage('Came back with ' + Object.keys(results).length + ' connection(s)...');
        app.mysqlClient = results.mysqlConnection;
        app.mongoClient = results.mongoConnection;
        app.redisClient = results.redisConnection;

        require('./api-rest');

        app.listen(port, function() {
            app.logmessage('Listening on :' + port + ' in "' + app.settings.env + '" mode...');
            return 0;
        });
    });
}

if (cluster.isMaster) {
    app.logmessage('Staring ' + forks + ' fork(s)');
    for (var i = 0; i < forks; i++) {
        var worker = cluster.fork();
    }
}

module.exports.app = app;
