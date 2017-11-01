#!/bin/bash
# Update project repo
cd /home/vagrant/MIC-Project
echo "####### Pulling Latest Repo #######"
git pull
# Startup MongoDB
echo "####### Starting MongoDB #######"
echo "\n\n####### System Init -> Starting MongoDB #######" >> /home/vagrant/mongod-log
mongod --dbpath /home/vagrant/MIC-Project/webgmeData &>>/home/vagrant/mongod-log &
# Startup WebGME
cd /home/vagrant/MIC-Project/webgmeProject
echo "####### Starting WebGME #######"
npm start &>>/home/vagrant/webgme-log &