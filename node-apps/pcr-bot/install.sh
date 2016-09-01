#!/usr/bin/env bash

# doesn't seem necessary on Ubuntu 16.04
add-apt-repository -y ppa:chris-lea/node.js
apt-get update
apt-get -y install nodejs libfontconfig1