"""用 bandwidth-sample.csv 复算《一张账单怎么分》里的分摊对比表。

用法：python3 verify.py bandwidth-sample.csv
只依赖 Python 标准库。
"""
import csv, itertools, math, random, sys

path = sys.argv[1] if len(sys.argv) > 1 else "bandwidth-sample.csv"
with open(path) as f:
    rows = list(csv.reader(f))
names = rows[0][1:]
X = [[float(r[j + 1]) for r in rows[1:]] for j in range(len(names))]
n, T = len(names), len(X[0])
K = int(T * 0.05)  # 去掉最高的 5%


def p95(series):
    """95 计费值：从大到小排序，去掉最高的 5% 后的最大值。"""
    return sorted(series, reverse=True)[K]


def c(S):
    """c(S)：只有组合 S 里的使用方时，合计曲线的 95。"""
    if not S:
        return 0.0
    return p95([sum(X[i][t] for i in S) for t in range(T)])


cache = {}


def cm(mask):
    if mask not in cache:
        cache[mask] = c([i for i in range(n) if mask >> i & 1])
    return cache[mask]


total = [sum(X[i][t] for i in range(n)) for t in range(T)]
C = p95(total)
res = {}

# 单点法：95 那个时间点各自的占比
t95 = sorted(range(T), key=lambda t: total[t], reverse=True)[K]
res["单点法"] = [X[i][t95] / total[t95] for i in range(n)]

# 独立值：各自 95 的占比
sa = [c([i]) for i in range(n)]
res["独立值"] = [x / sum(sa) for x in sa]

# 留一边际：去掉自己后账单减少多少，再归一
loo = [C - c([j for j in range(n) if j != i]) for i in range(n)]
res["留一边际"] = [x / sum(loo) for x in loo]

# 按总流量
vol = [sum(X[i]) for i in range(n)]
res["按总流量"] = [x / sum(vol) for x in vol]

# 精确 Shapley：对所有组合加权求边际
sh = [0.0] * n
for i in range(n):
    for m in range(1 << n):
        if m >> i & 1:
            continue
        s = bin(m).count("1")
        w = math.factorial(s) * math.factorial(n - s - 1) / math.factorial(n)
        sh[i] += w * (cm(m | 1 << i) - cm(m))
res["精确 Shapley"] = [x / C for x in sh]

# Owen：A、E、F 一组；B、C 一组；D 一组（组内成员在加入顺序里连续）
idx = {k: i for i, k in enumerate(names)}
groups = [[idx["A"], idx["E"], idx["F"]], [idx["B"], idx["C"]], [idx["D"]]]
ow, cnt = [0.0] * n, 0
for go in itertools.permutations(range(len(groups))):
    for inner in itertools.product(*[list(itertools.permutations(groups[g])) for g in go]):
        m = 0
        for blk in inner:
            for i in blk:
                ow[i] += cm(m | 1 << i) - cm(m)
                m |= 1 << i
        cnt += 1
res["Owen"] = [x / cnt / C for x in ow]

# 95 区间（专利）：总带宽落在 95 值上下 ±3% 内的时间点
band = [t for t in range(T) if C * 0.97 <= total[t] <= C * 1.03]
bt = sum(total[t] for t in band)
res["95 区间"] = [sum(X[i][t] for t in band) / bt for i in range(n)]

# 基准分层：基准 = 平均总带宽，基准部分按总流量，其余按 Shapley
base = sum(total) / T
res["基准分层"] = [(base / C) * v + (1 - base / C) * s for v, s in zip(res["按总流量"], res["精确 Shapley"])]

# 蒙特卡洛 Shapley：随机抽 20 个加入顺序（结果随种子变化）
rnd = random.Random(1)
mc = [0.0] * n
for _ in range(20):
    order = list(range(n))
    rnd.shuffle(order)
    m = 0
    for i in order:
        mc[i] += cm(m | 1 << i) - cm(m)
        m |= 1 << i
res["蒙特卡洛（20 个顺序）"] = [x / 20 / C for x in mc]


def worst_core(a):
    """所有组合里，分到的成本最多超出它们独立采购成本的比例。"""
    worst = 0.0
    for m in range(1, 1 << n):
        S = [i for i in range(n) if m >> i & 1]
        worst = max(worst, (sum(a[i] for i in S) * C - cm(m)) / cm(m))
    return worst


print(f"总账单 95 = {C:.1f}，独立成本之和 = {sum(sa):.1f}，95 区间内的点数 = {len(band)}")
print("方法".ljust(16), " ".join(k.rjust(6) for k in names), " 最多超出独立采购")
for k, v in res.items():
    print(k.ljust(16), " ".join(f"{x * 100:5.1f}%" for x in v), f" {worst_core(v) * 100:5.1f}%")
