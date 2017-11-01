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
# Clone project repo
cd /home/vagrant/
echo "####### Cloning Project #######"
git clone https://github.com/cahartsell/MIC-Project.git
# Setup system init script
echo "####### Configuring System Boot Script ########"
cp /home/vagrant/MIC-Project/webgme-vm/webgme-init.sh /etc/init.d/
chmod +x /etc/init.d/webgme-init.sh
update-rc.d webgme-init.sh defaults 100
# Startup MongoDB
echo "####### Starting MongoDB #######"
mongod --dbpath /home/vagrant/MIC-Project/webgmeData &>/home/vagrant/mongod-log &
# Startup WebGME
cd /home/vagrant/MIC-Project/webgmeProject
# Make sure all necessary packages installed
sudo npm install
sudo npm install webgme
echo "####### Starting WebGME #######"
npm start &>/home/vagrant/webgme-log &
# Make sure vagrant owns all files
chown -R vagrant /home/vagrant/