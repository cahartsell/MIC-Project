#!/bin/bash
# Setup script for Vagrant-based VM intended to host a WebGME server

# Install required dependencies
sudo apt-get update -y
sudo apt-get install -y curl
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo apt-get install -y git

# MongoDB install
sudo apt-key adv -y --keyserver hkp://keyserver.ubuntu.com:80 --recv 0C49F3730359A14518585931BC711F9BA15703C6
echo "deb http://repo.mongodb.org/apt/debian jessie/mongodb-org/3.4 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-3.4.list
sudo apt-get update -y
# Force yes because mongoDB whines about unauhenticated packages
sudo apt-get install -y --force-yes mongodb-org

# Install WebGME
sudo npm install -g webgme-cli --unsafe-perm=true

# Startup MongoDB
cd /home/vagrant/
mkdir webgmeData
echo "####### Starting MongoDB #######"
mongod --dbpath /home/vagrant/webgmeData &>/home/vagrant/mongod-Log &

# Startup WebGME
webgme init webgmeProject
cd webgmeProject
sudo npm install
sudo npm install webgme
echo "####### Starting WebGME #######"
npm start &>/home/vagrant/webgme-log &