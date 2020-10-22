# Aggregator
Code, docs and discussion related to the Aggregator.

### Aggrivate
The "puller" for the aggregators is called "Aggrivate" and is a node.js application.  It uses Iconv, so you will need to install your distribution's "build-essential" package prior to running npm install.


This is a companion application for the parser component.  This app downloads podcast feeds and does basic validation, then saves the feed contents to files in batches.  The parser app then comes along and reads the files to extract the content and update the DB with what it found.
