---
title: hacking my kindle pt.2
layout: layouts/post.njk
tags:
  - cyberdeck
  - hacking
  - kindle
---

**Some information i have found while researching:**

Kernel drivers loaded in linux:

```
g_mass_storage          4203  0
usb_f_ecm              10309  0
usb_f_rndis            27251  0
u_ether                14348  2 usb_f_ecm,usb_f_rndis
bcmdhd                669190  0
usb_f_mass_storage     51007  2 g_mass_storage
libcomposite           49114  4 g_mass_storage,usb_f_ecm,usb_f_rndis,usb_f_mass_storage
configfs               26493  5 usb_f_ecm,usb_f_rndis,usb_f_mass_storage,libcomposite
cyttsp5_i2c             2569  0
cyttsp5                90300  2 cyttsp5_i2c
falcon                 21319  0 [permanent]
mxc_epdc_v2_fb         99289  3
```

SPI drivers showing up on `/sys/bus/spi/drivers`:
```
74x164         m25p80         mtd_dataflash
at25           mc13xxx        sst25l
```

No devices showing up on `/sys/bus/spi/devices`

