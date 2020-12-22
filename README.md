# Aggregator
Code, docs and discussion related to the Aggregator.

### Aggrivate
The "puller" for the aggregators is called "Aggrivate" and is a node.js application.  It uses Iconv, so you will need to install your distribution's "build-essential" package prior to running npm install.

### Partytime
The "parser" for the aggregators is called "Partytime" and is a node.js application.


The puller and parser run independently of each other.  Aggrivate is constantly polling for updated feed content.  When it finds updated content, it downloads that content into a file named with the feed id
and updates the feed record in the database with `updated=<node id of this server>`.  The parser is then constantly polling the database for feeds marked with `updated=<node id of this server>`.  When any are
returned it looks for their files and parses them into the DB.

Batch DB inserts are used whenever possible.