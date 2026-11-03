"""一万个用户的蒙特卡洛 Shapley：耗时、误差，以及和单点法、95 区间法的比较。

用法：python3 shapley_bench.py
依赖 numpy；内存约需 1GB。数据是随机生成的模拟数据（固定随机种子），
耗时会因机器不同而不同，其余数字可以复现。
"""
import time

import numpy as np

rng = np.random.default_rng(0)
n, D, P = 10000, 30, 288          # 1 万个用户，30 天，每天 288 个 5 分钟
T = D * P
K = int(T * 0.05)                 # 95 计费：去掉最高的 5%
h = (np.arange(T) % P) / 12.0     # 每个点对应的小时


def bump(center, width):
    """以某个小时为中心的一个高峰。"""
    d = np.minimum(abs(h - center), 24 - abs(h - center))
    return np.exp(-(d / width) ** 2)


def p95(series):
    """从大到小第 K+1 个值，即 95 计费值。"""
    return np.partition(series, T - K - 1)[T - K - 1]


# 生成用户：规模长尾分布，高峰多在晚上，也有凌晨、上午、下午的
size = rng.lognormal(0, 1.5, n).astype(np.float32)
peak = rng.choice([3, 10, 14, 21, 21, 21, 22], n) + rng.normal(0, 1, n)
X = np.empty((n, T), np.float32)
for i in range(n):
    X[i] = size[i] * (0.2 + bump(peak[i], rng.uniform(1, 4))) * (1 + 0.1 * rng.standard_normal(T))
X = np.clip(X, 0, None)
total = X.sum(0)
C = p95(total)


def one_permutation(order):
    """按一个随机顺序依次加入用户，返回每个人加入时 95 的增量（边际成本）。"""
    running = np.zeros(T, np.float32)
    prev, marg = 0.0, np.empty(n, np.float32)
    for i in order:
        running += X[i]
        cur = p95(running)
        marg[i] = cur - prev
        prev = cur
    return marg


start = time.time()
M = np.array([one_permutation(rng.permutation(n)) for _ in range(64)])
print(f"每个排列耗时 {(time.time() - start) / 64:.2f} 秒（numpy，单核）")

mean = M.mean(0)
shapley = mean / mean.sum()
need = ((M.std(0, ddof=1) / np.abs(mean)) / 0.01) ** 2   # 达到 1% 相对误差所需排列数
order = np.argsort(-size)
for name, idx in [("最大的 100 个", order[:100]), ("中间的 200 个", order[4900:5100]), ("最小的 100 个", order[-100:])]:
    print(f"{name}：达到 1% 相对误差约需 {int(np.median(need[idx]))} 个排列")

# 和单点法、95 区间法比较
t95 = np.argsort(total)[::-1][K]
single = X[:, t95] / total[t95]
band = (total >= C * 0.97) & (total <= C * 1.03)
interval = X[:, band].sum(1) / total[band].sum()


def diff(a, b):
    """两种分摊结果之间，有多少比例的成本被分给了不同的人。"""
    return 0.5 * np.abs(a - b).sum() * 100


print(f"Shapley 与单点法差异 {diff(shapley, single):.1f}%")
print(f"Shapley 与 95 区间差异 {diff(shapley, interval):.1f}%")
print(f"单点法与 95 区间差异 {diff(single, interval):.1f}%")
