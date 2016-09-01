var casper = require('casper').create({
  clientScripts: ["jquery-1.11.1.min.js"]
}),
    requiredParams = ['scn', 'appid', 'username', 'password', 'year', 'reports', 'outputs'],
    missingParams = [],
    options = casper.cli.options,
    loginURL = 'https://webapps.pcrsoft.com/Campus/login.aspx?scn=' + options.scn + '&appId=' + options.appid,
    page = 'DMT',
    reports = options.reports ?
              (options.reports.indexOf(',') !== -1) ?
              options.reports.split(',') : [options.reports] : [],
    outputs = options.outputs ?
                      (options.outputs.indexOf(',') !== -1) ?
                      options.outputs.split(',') : [options.outputs] : [],
    year = options.year,
    username = options.username,
    password = options.password,
    timeout = options.timeout || 10000,
    loginFailedString = 'Your login attempt was not successful. Please try again.',
    production = true;

// HACK: Make console.error send to stderr instead of stdout (https://github.com/ariya/phantomjs/issues/10150)
console.error = function () {
    require("system").stderr.write(Array.prototype.join.call(arguments, ' ') + '\n');
};

requiredParams.forEach(function(param) {
    if(typeof options[param] === 'undefined') {
        missingParams.push(param);
    }
});

if(missingParams.length > 0) {
    console.error('FATAL: Missing Required Parameters: ' + missingParams.join(', '));
    casper.exit(1);
}

function login(username, password) {
    $(function() {
        // Triggering submit on the form, or an enter key press in the password field do not submit the form
        $('[name*="UserName"]').val(username);
        $('[name*="Password"]').val(password);
        $('[value="Log In"]').trigger('click');
    });
}

function selectYear(year) {
    var yearRegExp = new RegExp(year, 'i'),
        yearValue;

    $('select[name*="SchoolYear"] > option').each(function() {
        if(yearRegExp.test(this.textContent)) {
            $(this.parentNode).val(this.value).trigger('change');
            yearValue = this.value;
            return false;
        }
    });

    return yearValue;
}

function navigateTopLevelPage(page) {
    eval($('a.menuItem:contains("'+page+'")').attr('href'));
    window.location.href = 'https://webapps.pcrsoft.com/Campus/ReportBuilder/Open.aspx';
}

function openReport(reportName) {
    eval($('td:contains("slate:' + reportName + '")').prev('td').children('a').attr('href'));
}

function downloadCSV(reportName, output, last) {
    // tell the proxy the report name, where to output the file, and whether it's the last report to be downloaded

    $.ajax(
        {
            type: 'GET',
            url: '/proxy',
            data: {
                reportName: reportName,
                last: last,
                output: output
            }
        }).responseText; // makes request synchronous

    return $('[value="Export"]').addClass('trigger').trigger('click').val('scrambled');
}

function reportWorkflow(reportName, output, callback) {
    production || console.log('Running report workflow for ' + reportName + '(' + (reports.indexOf(reportName)+ 1) +
                              '/' + reports.length + ')');
    production || console.log('Report will be output to: ' + output);

    production || console.log('Navigating to DMT...');

    casper.evaluate(navigateTopLevelPage, page);

    casper.waitForUrl(
        /Open\.aspx/i, function () {
            production || console.log('Opening report...');
            casper.evaluate(openReport, reportName);
        }, function () {
            callback();
            console.error('Timeout while opening report.');
            this.capture('failed_opening_report.png');
            Casper.exit(1);
        }, 1000);

    casper.waitForUrl(/Results.aspx/i, function() {
        production || console.log('Downloading CSV...');
        casper.evaluate(downloadCSV, reportName, output, (reports.indexOf(reportName) + 1) === reports.length);

        casper.waitForUrl(/Results.aspx/i, function() {
            production || console.log('CSV requested.');
            callback();
        }, function() {
            console.error('Timeout occurred waiting for CSV to be requested.');
            Casper.exit(1);
        }, 10000);

    }, function() {
        callback();
        this.capture('failed_download.png');
        console.error('Timeout occurred while downloading CSV.');
        Casper.exit(1);
    }, 10000);
}

casper.on('page.resource.requested', function(requestData, request) {
    var url = requestData.url;

    production || console.log(url);

    if(url.indexOf('ErrorPage.aspx') !== -1) {
        production || console.error('An error has occurred!');
        casper.capture('error.png');
    }

    if (url.indexOf('pcrsoft.com') === -1 && url.indexOf('googleapis.com') === -1) {
        production || console.log('Not downloading: ' + url);
        request.abort();
    }
});

casper.on('resource.requested', function(requestData, request) {
    var url = requestData.url;

    // We don't have SSL certificates for other domains, this will prevent connection errors
    if (url.indexOf('pcrsoft.com') === -1 && url.indexOf('googleapis.com') === -1) {
        request.abort();
    }
});

casper.start(loginURL, function() {
    production || console.log('Logging in as ' + username + ' at ' + loginURL);
    casper.evaluate(login, username, password);
});

casper.waitForUrl(
    /Default\.aspx/i, function () {

        production || console.log('Selecting year: ' + year);
        var yearSelector = 'select[id*=SchoolYear] option[value="' + casper.evaluate(selectYear, year) + '"][selected="selected"]';

        casper.waitForSelector(yearSelector, function() {
           var x = 0;

           function loopReports(reports) {
               reportWorkflow(
                   reports[x], outputs[x], function () {
                       x++;

                       // any more items in array? continue loop
                       if (x < reports.length) {
                           loopReports(reports);
                       }
                   }
               );
           }

           loopReports(reports);
       },
       function() {
           callback();
           console.error('Timeout while selecting year.');
           this.capture('failed_selecting_year.png');
           Casper.exit(1);
       }, 5000);
    },
    function () {
        casper.waitForText(loginFailedString, function() {
            console.error('An authentication error occurred.');
            this.capture('auth_fail.png');
            this.exit(1);
        }, function() {
            console.error('Timeout waiting for home page to load.');
            this.capture('login_timeout.png');
            this.exit(1);
        }, 1000);
    }, 10000
);

casper.run();