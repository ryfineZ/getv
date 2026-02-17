---
trigger: always_on
---

在运行 ffmpeg 相关测试时，必须使用 -loglevel error 或者将输出重定向到文件，严禁将完整的 ffmpeg debug log 打印到终端，否则会瞬间撑爆通讯协议。