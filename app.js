// Dependencies
//
var express = require('express')
  , http = require('http')
  , path = require('path')
  , WebSocket = require('ws')
  , WebSocketServer = WebSocket.Server
  , TwitterFinder = require('./tfinder');

// Get VCAP Services
//if (process.env.VCAP_SERVICES) {
//  // Running on Bluemix. Parse the port and host that we've been assigned.
//  var cloudantENV = JSON.parse(process.env.VCAP_SERVICES);
//  var cloudantHOST = process.env.VCAP_APP_HOST;
//  var cloudantPORT = process.env.VCAP_APP_PORT;
//  console.log('VCAP_SERVICES: %s', process.env.VCAP_SERVICES);
//
//  // Also parse Cloudant settings.
//  var cloudantSettings = env['cloudantNoSQLDB'][0]['credentials'];
//  var cloudantUser = cloudantSettings.get("username")
//  var cloudantPWD = cloudantSettings.get("password")
//}

// Cloudant
//
var host = "localhost";
var port = 3030;
var cloudant = {
  // From the Bluemix deploymnet of the Cloudant Service
  // a) Get the URL from Cloudant credentials and replace everything in the line below, between the double quotes, with <URL> value
  // b) Alternativelly, get the Username, Password and Hostname and replace each
  url : "https://[CHANGE_THIS_TO_USERNAME]:[CHANGE_THIS_TO_PASSWORD]@[CHANGE_THIS_TO_HOST]"
};

if (process.env.hasOwnProperty("VCAP_SERVICES")) {
  // Running on Bluemix. Parse out the port and host that we've been assigned.
  var env = JSON.parse(process.env.VCAP_SERVICES);
  var host = process.env.VCAP_APP_HOST;
  var port = process.env.VCAP_APP_PORT;

  // Also parse out Cloudant settings.
  cloudant = env['cloudantNoSQLDB'][0].credentials;  
}
var nano = require('nano')(cloudant.url);
var db = nano.db.use('totem');


// Get the Twitter access keys from
// the environment variable TWITTER_KEYS
//
var TwitterKeys = {};

if ( process.env.TWITTER_KEYS ) {
  console.log('Got TWITTER_KEYS');
  var k = JSON.parse(process.env.TWITTER_KEYS);

  TwitterKeys.consumer_key = k.consumer_key;
  TwitterKeys.consumer_secret = k.consumer_secret;
  TwitterKeys.access_token_key = k.access_token_key;
  TwitterKeys.access_token_secret = k.access_token_secret;
}

if ( TwitterKeys.consumer_key === undefined ||
     TwitterKeys.consumer_secret === undefined ||
     TwitterKeys.access_token_key === undefined ||
     TwitterKeys.access_token_secret === undefined ) {
  console.log('ERROR: at least one Twitter access key is not set.');
}

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' === app.get('env')) {
  app.use(express.errorHandler());
}

var server = http.createServer(app).listen(app.get('port'), function() {
  console.log('TOTEM server listening on port ' + app.get('port'));
});

// Create the WebSocket endpoint that does the job
//
var searchServer = new WebSocketServer( {server: server, path: '/search'});

// One connection manages one twitter search.
// To stop current search simply close this connection.
//
searchServer.on('connection', function(ws) {
  console.log('>> searchServer.on connection');

  // Create a twitter finder for the duration of the connection
  //
  var finder = new TwitterFinder(TwitterKeys);

  // Set the events handlers on the websocket
  //
  ws.on('message', function(searchstring, flags) {
    console.log('>> ws.on message');

    // Ignore the message if the search is already running
    // The client must close the connection to stop searching
    //
    if ( finder.isRunning() ) {
      console.log('Finder already running.');
      return;
    }

    finder.on('data', function(tweets) {
      console.log('Sending ' + tweets.length + ' tweets matching the query ' + searchstring);

      // Function to transform the tweet.text to a html snippet to be sent to the client
      //
      var tweetToText = function(tweet) {
        var msg = '@' + tweet.user.screen_name + ' on ' + tweet.created_at + ' said -> ' + tweet.text;
        return msg
                .replace(/((http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?)/g, '<a href="$1">$1</a>')
                .replace(/(@([A-Za-z0-9_]+))/g, '<a href="https://twitter.com/$2">$1</a>')
                .replace(/(\#([A-Za-z0-9_]+))/g, '<a href="https://twitter.com/search?q=%23$2&src=hash">$1</a>');
      };

      // This is the format of the object that should be sent:
      //
      // {
      //   address: "user.location attribute of the tweet",
      //   text: "text attribute of the tweet formatted as html"
      // }
      //
      // Get tweets from the bottom of the array to start
      // from the oldest.
      //
      for (var i=tweets.length-1; i>=0; i--) {
        var data = { address: tweets[i].user.location,
                     text:     tweetToText(tweets[i]) };
        ws.send(JSON.stringify(data));
       // Generate JSON Record 
       // Insert into Cloudant
       var tweetJSON = { "searchString": searchstring
                       , "created_at": tweets[i].created_at 
                       , "id": tweets[i].id
                       , "id_str": tweets[i].id_str
                       , "text": tweets[i].text
                       , "source": tweets[i].source
                       , "address": tweets[i].location
                       , "in_reply_to_status_id": tweets[i].in_reply_to_status_id
                       , "in_reply_to_status_id_str": tweets[i].in_reply_to_status_id_str
                       , "in_reply_to_user_id": tweets[i].in_reply_to_user_id
                       , "in_reply_to_user_id_str": tweets[i].in_reply_to_user_id_str
                       , "in_reply_to_screen_name": tweets[i].in_reply_to_screen_name
                       ,  "user": { "id": tweets[i].user.id
                                  , "id_str": tweets[i].user.id_str
                                  , "location": tweets[i].user.location 
                                  , "name": tweets[i].user.name
                                  , "screen_name": tweets[i].user.screen_name
                                  , "created_at": tweets[i].user.created_at
                                  , "lang": tweets[i].user.lang }
                       , "geo": tweets[i].geo
                       , "coordinates": tweets[i].coordinates
                       , "place": tweets[i].place
                       , "contributors": tweets[i].contributors
                       };

            db.insert({ tweet: tweetJSON }
                     ,  function(err, body) {
              if (err) {
              	  console.log('[totem.insert] ', err.message);
                  return;
              }
              console.log('tweet inserted into totem');
              console.log(body);
           });
        } //for loop
    }); // finder.on('data')

    finder.on('stop', function(reason) {
      console.log('Twitter finder stopped. Reason: ', reason);
    });

    finder.on('error', function(err) {
      console.log('Twitter finder reported an error: ', err);

      // Stop the finder and close the socket
      finder.stop(err);
      ws.close(1001, err.message);
    });

    console.log('Start a new search for: ', searchstring);
    finder.start(searchstring);
  }); //ws.on('message')

  ws.on('close', function(code, reason) {
    console.log('>> ws.on close');
    console.log('Socket closed. Code: ' + code + ', reason: ' + reason);

    // Stop the finder
    //
    finder.stop(new Error('Socket closed by the client'));
  }); // ws.on('close')

  ws.on('error', function(err) {
    // Just log the error. You don't need to do anything else
    // because the WebSocket triggers the close event shortly.
    //
    console.log('>> ws.on error: ', err);
  }); // ws.on('error')
}); // searchServer.on