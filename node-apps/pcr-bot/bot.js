var jsonInput = '',
    options = {},
    requiredParams = ['scn', 'appid', 'username', 'password', 'year', 'reports'],
    exec = require('child_process').exec,
    bot,
    proxy;

function optionsToParams(options) {
    var params = '';

    for(var prop in options) {
        params += ' --' + prop + '="' + options[prop] + '" ';
    }

    return params;
}

process.stdin.setEncoding('utf8');

process.stdin.on('readable', function() {
    var chunk = process.stdin.read();

    if (chunk !== null) {
        jsonInput += chunk;
    }
});

process.stdin.on('end', function() {
    var command,
        reports = [],
        outputs = [];

    try {
        var missingParams = [];

        options = JSON.parse(jsonInput);

        requiredParams.forEach(function(param) {
           if(typeof options[param] === 'undefined') {
               missingParams.push(param);
           }
        });

        if(missingParams.length > 0) {
            console.error('FATAL: Missing Required Parameters: ' + missingParams.join(', '));
            process.exit(1);
        }

        for(var report in options.reports) {
            reports.push(report);
            outputs.push(options.reports[report]);
        }

        delete options.reports;

        options.outputs = outputs.join(',');
        options.reports = reports.join(',');

    } catch(e) {
        console.error('FATAL: Invalid JSON input.');
        process.exit(1);
    }

    command = 'node proxy.js -p8888';

    proxy = exec(command,
     function (error, stdout, stderr) {
         if(stderr) {
             console.log(JSON.stringify({success: false, error: stderr}));
             process.exit(1);
         }

         if (error !== null) {
             console.log(JSON.stringify({success: false, error: error}));
             process.exit(1);
         }
     });

    command = 'PHANTOMJS_EXECUTABLE=./node_modules/.bin/phantomjs ' +
              './node_modules/.bin/casperjs --proxy="127.0.0.1:8888" --ignore-ssl-errors=true pcr-bot.js ' +
              optionsToParams(options);

    bot = exec(command,
     function (error, stdout, stderr) {
         if(stderr) {
             console.log(JSON.stringify({success: false, error: stderr.toString().trim()}));
             process.exit(1);
         }

         if (error !== null) {
             console.log(JSON.stringify({success: false, error: error}));
             process.exit(1);
         }

         console.log(JSON.stringify({success: true}));
         process.exit(0);
     });
});

function cleanupProcesses() {
    bot.kill('SIGHUP');
    proxy.kill('SIGHUP');
}

process.on('uncaughtException', function(err) {
    console.error(JSON.stringify({success: false, error: 'bot.js caught an exception: ' + err}));
    cleanupProcesses();
    process.exit(1);
});

process.on('exit', cleanupProcesses);

