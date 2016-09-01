# PCR Bot

## Installation

From the root directory of this repo, run the following to install Casper.js and the needed modules for the bot.

```
sudo ./install.sh
npm install
```

### To Test
***Make sure to username and password in the ``sample-input.json`` file to an actual value.***

```
cat sample-input.json | node bot.js
```

### JSON input ###
```javascript
{
    "scn": "ScienceLeadership",
    "appid": "1",
    "username": "CHANGE_ME",
    "password": "CHANGE_ME",
    "year": "next",
    "reports": {
        "students": "/tmp/students.csv",
        "sections": "/tmp/sections.csv",
        "schedule": "/tmp/schedule.csv"
    }
}
```

### Todo
1. Error handling for authentication errors (if required)