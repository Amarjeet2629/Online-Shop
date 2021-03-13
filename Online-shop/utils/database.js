const mongodb = require('mongodb');

const MongoClient = mongodb.MongoClient;

const URI = 'mongodb://sha256:sha256@cluster0-shard-00-00.h3uaf.mongodb.net:27017,cluster0-shard-00-01.h3uaf.mongodb.net:27017,cluster0-shard-00-02.h3uaf.mongodb.net:27017/test?ssl=true&replicaSet=atlas-deri93-shard-0&authSource=admin&retryWrites=true&w=majority';
let _db;

const mongoConnect = (callback) => { MongoClient.connect(URI, {useUnifiedTopology:true})
.then(client => {
    console.log('Connection Successful');
    _db = client.db();
    callback();    
})
.catch(err => {
    console.log('Error!!!')
    console.log(err)})
}

const getDb = () => {
    if(_db){
        return _db;
    }
    throw 'No database Found';
}

exports.mongoConnect = mongoConnect;
exports.getDb = getDb;