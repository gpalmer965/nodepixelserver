Node Pixel Server
=================
This project implements a Node server using express, johnny-five, socket.io, and node-pixel to control a Neopixel or similar strip using a web interface. Two hardware modes are included, backpack uses a Raspberry pi to run the server, and connect to an Arduino in I2C backpack mode (https://github.com/ajfisher/node-pixel/blob/master/docs/installation.md). The other configuration is to use a laptop or other computer as the server running node, which connects to an Arduino running node-pixel firmata via usb.
