#!/usr/bin/env node

'use strict';

var optimist = require('optimist'),
    url = require('url'),
    fs = require('fs'),
    zlib = require('zlib'),
    Proxy = require('http-mitm-proxy'),
    proxy = Proxy(),
    reportName,
    last = false,
    output,
    args = optimist
    .alias('h', 'help')
    .alias('h', '?')
    .alias('o', 'out')
    .options('port', {
         default: 8888,
         describe: 'Proxy port to listen on'
     })
    .options('out', {
         default: 'Results.csv',
         describe: 'Path to output intercepted CSV file to.'
     })
    .alias('p', 'port')
    .argv;

if (args.help) {
    optimist.showHelp();
    return process.exit(-1);
}

args.sslCertCacheDir = __dirname + '/certs';

proxy.onRequest(function(ctx, callback) {
    var requestUrl = ctx.clientToProxyRequest.url,
        params;

    if(requestUrl.indexOf('/proxy?') !== -1) {
        params = url.parse(requestUrl, true).query;
        last = (params.last === 'true');
        reportName = params.reportName;
        output = params.output;

        // Discard proxy request (do not send to server)
        return callback('not really');
    }

    return callback();
});

proxy.onResponse(function(ctx, callback) {

    if(ctx.serverToProxyResponse.headers['content-type'] === 'text/csv; charset=utf-8') {
        console.log('Intercepted CSV file for report: ' + reportName);

        var gunzipStream = zlib.createGunzip();
        var outputStream = fs.createWriteStream(output);
        gunzipStream.pipe(outputStream);

        ctx.serverToProxyResponse.pipe(gunzipStream);

        ctx.serverToProxyResponse.on('close', function() {
            console.log('Done reading stream.');
            gunzipStream.close();
        });

        gunzipStream.on('close', function() {
            console.log('Done gunzipping stream.');
            outputStream.close();
        });

        outputStream.on('close', function() {
            console.log('Done writing stream to: ' + output);

            if(last) {
                process.exit(0);
            }
        });
    }

    return callback();
});

proxy.onError(function(ctx, err) {
    if(err !== 'not really') {
        console.error('Proxy error:', err);
    }
});

process.on('uncaughtException', function(err) {
    console.error('proxy.js caught an exception: ' + err);
    process.exit(1);
});

proxy.listen(args);
console.log('Proxy listening on ' + args.port);
