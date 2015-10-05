// TwitterFinder. It is an event emitter
//

var Twitter = require('ntwitter')
    , util = require('util')
    , EventEmitter = require('events').EventEmitter;

function TwitterFinder(keys) {
  // Do not forget to call the parent class constructor
  EventEmitter.call(this);

  this.tapi = new Twitter(keys);
  this.query = undefined;
  this.lastId = undefined;
  this.querySchedule = undefined;
  this.count = 100; // default # tweets to get in a search
  this.interval = 30000; // default query interval to 20 seconds
  this.running = false;
}

util.inherits(TwitterFinder, EventEmitter);

TwitterFinder.prototype.start = function(searchstring) {
  console.log('>> TwitterFinder.start');

  if ( this.running ) {
    var err = new Error('Cannot start. Another search is running. Stop it first.');
    this.emit('error', err);
    return;
  }

  console.log('Start doing periodic searches on twitter api.');

  var querySchedule = function() {

    if ( !this.running ) {
      console.log('Finder stopped. Not submitting twitter search.');
      return;
    }

    this.tapi.search(this.query, {since_id: this.lastId, count: this.count}, function(err, data) {
      console.log('>> TwitterFinder.search done');

      if ( err ) {
        console.log('Got an error searching twitter: ', err);

        // Before emitting an event ensure the finder is still in running state
        //
        if ( this.running ) {
          console.log('Emitting error event.');
          this.emit('error', err);

          // It can be a temporary error, do not stop searching.
          setTimeout(querySchedule, this.interval); // schedule next run
        } else {
          console.log('Finder stopped meanwhile. Not emitting error event');
        }
      } else {
        // Data returned by tapi.search is in this fomat:
        // search_metadata: {...},
        // statuses: [...]
        // we emit statuses only
        //
        // Update the lastId to start getting that from there next time we query twitter
        //
        this.lastId = data.search_metadata.max_id;
        console.log('Got ' + data.statuses.length + ' tweets matching ' + this.query + ' from id ' + this.lastId);
        if ( this.running ) {
          if ( data.statuses.length > 0 ) {
            console.log('Emitting data event');
            this.emit('data', data.statuses);
          }
          setTimeout(querySchedule, this.interval); // schedule next run
        } else {
          console.log('Finder stopped meanwhile. Not emitting data event');
        }
      }

    }.bind(this));

  }.bind(this);

  this.running = true;
  this.query = searchstring;
  this.lastId = 0;

  querySchedule();
};

// The caller can set a reason to signal why the finder
// is being stopped.
//
TwitterFinder.prototype.stop = function(reason) {
  console.log('>> TwitterFinder.stop');

  if ( this.running ) {
    this.running = false;

    this.query = undefined;
    this.lastId = undefined;

    console.log('Finder stopped with reason: ', reason);
    this.emit('stop', reason);
  }

};

TwitterFinder.prototype.isRunning = function() {
  return this.running;
};

module.exports = TwitterFinder;
