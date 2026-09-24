# 公交换乘规划器

React与TypeScript最小项目，业务功能尚未实现。依赖版本由package-lock.json锁定。

本目录的`.tools/node`已独立安装Node.js22.16.0和npm10.9.2，不引用其他项目的工具链。开始开发前在当前项目目录执行：

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
npm run dev
```

依赖已安装，重新安装使用`npm ci`。构建使用`npm run build`。Vitest已准备，编写必要测试后使用`npm test`。当前起点没有业务测试，不把空测试集当成通过。

Node二进制不提交到Git。新克隆环境可从Node.js官方获取node-v22.16.0-linux-x64.tar.xz，解压到本目录的`.tools/node`，保持`bin/node`和`bin/npm`存在，然后运行`npm ci`。
