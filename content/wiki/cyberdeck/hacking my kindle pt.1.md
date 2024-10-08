---
title: hacking my kindle pt.1
layout: layouts/post.njk
tags:
  - cyberdeck
  - hacking
  - kindle
---
this is not a guide, just my process, although if you have any question, feel free to contact me

### things i want to achieve with my kindle
- spi interface to expand storage
- remove amazon's gui frontend but leave the kernel intact

(i could also apply the theseus boat approach and hack around some drivers based on [epdiy](https://github.com/vroland/epdiy) and a raspberry pi pico but where's the fun in that?)

### storage expansion
so i have made some investigation about this, my kindle model does not have an internal sd card port, just an emmc chip :( taking this into account, i have these options
- resolder the emmc chip for a "larger" one
	- this is not an option, i have no experience soldering BGA and although it has been done with other kindles, my model is relatively new so there are no documented cases of people doing it. (also it may simply not work because of firmware)
- internal usb port
	- not following this approach because these ports are rarely available and only on models with included 3G modems inside (mine does not)
- SPI SD Card (this is the one)
	- The imx6 sololite (cpu of my kindle) has 4 SPI ports, the [board](https://fccid.io/2ARGY-5237/Internal-Photos/EP-internal-4208082.pdf) has a ton of exposed of test points, one of them could be a pair of them could be exposing SPI right? (i wish it does)

**more on this approach:**
i need to find 1 SPI port on the PCB of my kindle, which i think could be easy? using an oscilloscope and searching for the CLK pad and assuming that MISO and MOSI are close to it.

now, on the software side, the linux kernel on the kindle was only compiled for kernelmode SPI access, no usermode. this is easy to solve, just recompile and flash. but just before i did that, i became aware of a particular file on the source of the linux kernel.

`mmc_spi.c`

this file implements a driver in a device tree fashion which needs to be compiled into a blob and acts like a "plugin" to the kernel and handling all the SPi -> SD communication all by itself that it even mounts it to the filesystem. neat huh ;)
([this site](https://ralimtek.com/posts/2016/2016-12-10-raspberry_pi_secondary_sd_card/) uses the exact same approach but for a rpi)

the device-tree-compiler needed to actually load this driver was not installed on my kindle but a simple package unpackaging from debian's armel repos worked great.

this approach sounds very straight forward but for the moment i have no acess to an oscilloscope so until my next kindle hacking post, bye