# React 缓存机制完整详解

---

## 一、三种缓存机制对比

| API | 缓存内容 | 触发条件 | 适用场景 |
|-----|---------|---------|---------|
| `useMemo` | 计算结果值 | 依赖数组变化 | 昂贵计算、派生数据 |
| `useCallback` | 函数引用 | 依赖数组变化 | 回调传递给子组件、作为其他 hook 依赖 |
| `React.memo` | 组件渲染结果 | props 变化（浅比较） | 纯展示组件、避免不必要渲染 |

---

## 二、新旧值比对机制

### 1. `useMemo` / `useCallback` — 依赖数组比对

依赖数组使用 **`Object.is`** 进行逐项比较：

```tsx
// 比对逻辑类似：
const depsEqual = (prevDeps: any[], nextDeps: any[]) =>
  prevDeps.every((dep, i) => Object.is(dep, nextDeps[i]));

// 示例：
const a = { x: 1 };
const b = { x: 1 };

Object.is(a, b);        // false — 对象引用不同
Object.is(1, 1);        // true  — 原始类型值相同
Object.is('a', 'a');    // true
Object.is(undefined, undefined); // true
```

**常见陷阱**：

```tsx
// ❌ 每次渲染都是新对象，memo 失效
const config = useMemo(() => ({ theme: 'dark' }), []); // 每次返回同一个引用？No！
// 实际上因为空依赖，只在首次创建，但如果你写成：
const config = useMemo(() => ({ theme }), [theme]);
// theme 变化时创建新对象，这是正确的

// ❌ 常见错误：忘记包含依赖
const sorted = useMemo(() => [...list].sort(), [list]); // OK

// ⚠️ 对象字面量的引用陷阱
const filter = { active: true };
const filtered = useMemo(() => list.filter(x => x.active), [filter]);
// ⚠️ filter 是外部变量，每次渲染可能引用不同！
// ✅ 正确做法：
const filter = useMemo(() => ({ active: true }), []); // 或者放入依赖
```

### 2. `React.memo` — props 浅比较（Shallow Comparison）

```tsx
// React.memo 默认使用 Object.is 逐个比较 props
const isEqual = (prevProps, nextProps) =>
  Object.keys(prevProps).every(key =>
    Object.is(prevProps[key], nextProps[key])
  );
```

**Primitive vs Reference**：

```tsx
// ✅ Primitive — 按值比较
<Component count={1} name="alice" />
// count: 1 → 1 (Object.is = true)
// name: "alice" → "alice" (Object.is = true)
// → 不重新渲染

// ⚠️ Object/Array/Function — 按引用比较
<Component user={{ name: 'alice' }} />
// 每次父组件渲染，{{ name: 'alice' }} 都是新对象
// Object.is({ name: 'alice' }, { name: 'alice' }) = false
// → 总是重新渲染

// ✅ 正确做法：用 useMemo/useCallback 稳定引用
const user = useMemo(() => ({ name: 'alice' }), []);
const handleClick = useCallback(() => {}, []);
<Component user={user} onClick={handleClick} />
```

---

## 三、组合使用：React.memo + useCallback

**核心原则**：子组件被 `memo` 包裹后，如果 props 中的回调函数引用每次都变，memo 就失效。

```tsx
// ❌ 失效案例
const Parent = () => {
  const handleClick = () => console.log('click'); // 每次新函数
  return <Child onClick={handleClick} />;
};

const Child = memo(({ onClick }: { onClick: () => void }) => {
  return <button onClick={onClick}>Click</button>;
});
// 每次 Parent 渲染，handleClick 是新函数引用
// Child 的 memo 比较 props.onClick：新函数 ≠ 旧函数 → 重新渲染
```

**正确组合**：

```tsx
// ✅ 有效案例
const Parent = () => {
  const handleClick = useCallback(() => console.log('click'), []); // 稳定引用
  return <Child onClick={handleClick} />;
};

const Child = memo(({ onClick }: { onClick: () => void }) => {
  return <button onClick={onClick}>Click</button>;
});
// 依赖数组为空，handleClick 永远是同一个函数
// Child 比较 props.onClick：同一引用 → 跳过渲染 ✅
```

---

## 四、`memo` 的第三参数：自定义比较函数

```tsx
// 语法
const MyComponent = memo(SubComponent, (prevProps, nextProps) => {
  // 返回 true = 相等，不渲染
  // 返回 false = 不等，渲染
  return prevProps.id === nextProps.id;
});
```

**使用场景**：
- 只关心某个特定属性变化
- 深比较（性能开销大，慎用）
- 性能优化：当 props 很复杂但只需要关注少数字段时

```tsx
const ListItem = memo(({ id, data, onClick }: Props) => {
  // 只关心 id 变化，data 变化不需要重新渲染
  return <div onClick={() => onClick(id)}>{data.label}</div>;
}, (prev, next) => prev.id === next.id);

// ⚠️ 注意事项：onClick 变化仍然会触发渲染
// 需要配合 useCallback：
const handleClick = useCallback((id: number) => {
  dispatch({ type: 'SELECT', payload: id });
}, [dispatch]);
<ListItem id={id} data={data} onClick={handleClick} />
```

---

## 五、useMemo vs useCallback 本质

```tsx
// useCallback(fn, deps) 等价于：
const fn = useMemo(() => fn, deps);

// 所以：
const handleClick = useCallback(() => console.log('hi'), []);
// 等价于
const handleClick = useMemo(() => () => console.log('hi'), []);
```

**何时用哪个**：
- 要缓存**值** → `useMemo`
- 要缓存**函数** → `useCallback`（语法更清晰）
- 两者都可用，只是语义不同

---

## 六、常见误区汇总

### 1. 过度优化

```tsx
// ❌ 不要这样
const a = useMemo(() => 1 + 1, []); // 简单计算不需要
const b = useCallback(() => 2 + 2, []); // 简单计算不需要
// useMemo/useCallback 本身有开销，过度使用反而降低性能
```

### 2. 依赖数组引用陷阱

```tsx
// ❌ 每次渲染 fn 都是新函数
const handleSubmit = useCallback(() => {
  onSubmit(data); // onSubmit 来自 props
}, [onSubmit]); // onSubmit 如果是内联函数，每次都是新的！

// ✅ 如果必须依赖外部函数，先 stable 化
const stableOnSubmit = useCallbackRef(onSubmit); // 自定义 hook 或第三方库
const handleSubmit = useCallback(() => stableOnSubmit(data), [stableOnSubmit]);

// 或者用 useRef 方案：
const onSubmitRef = useRef(onSubmit);
onSubmitRef.current = onSubmit;
const handleSubmit = useCallback(() => onSubmitRef.current(data), []);
```

### 3. useCallback 依赖函数式更新

```tsx
// ❌ 错误：setCount 是稳定函数，不需要 useCallback
const increment = useCallback(() => setCount(c => c + 1), []);

// ✅ 正确：直接定义即可
const increment = () => setCount(c => c + 1);
// 或者如果你确实要把函数作为依赖：
const increment = useCallback(() => setCount(c => c + 1), []); // 语义上更明确
```

### 4. 数组/对象字面量

```tsx
// ❌ 每次渲染创建新数组
const items = [1, 2, 3];
const filtered = useMemo(() => items.filter(x => x > 1), [items]);

// ✅ 如果 filter 不需要依赖外部变量，直接定义：
const filtered = useMemo(() => list.filter(x => x > 1), [list]);

// ⚠️ 空依赖陷阱：
const staticItems = useMemo(() => [1, 2, 3], []); // 正确，只创建一次
const staticItems = useMemo(() => [1, 2, 3]); // ⚠️ 每次渲染返回同一个引用（但语义不清）
```

### 5. React.memo 的子组件不要滥用

```tsx
// ❌ 过度使用 memo 的子组件
const BigComponent = memo(({ title }: { title: string }) => {
  // 内部逻辑复杂，包含了大量子组件
  return (
    <div>
      <ExpensiveChart data={data} />
      <HeavyTable rows={rows} />
      <ComplexForm onSubmit={handleSubmit} />
    </div>
  );
});

// ⚠️ memo 只对 props 变化起作用
// 如果 BigComponent 内部 state 变化（onClick, onChange 等），memo 保护不了你
// 该重新渲染还是重新渲染
```

---

## 七、性能优化决策树

```
是否需要优化渲染性能？
  ↓
先用 React DevTools Profiler 确认瓶颈
  ↓
需要缓存计算结果？
  → useMemo(expensiveComputation, [deps])

需要传递回调给子组件（且子组件被 memo 包裹）？
  → useCallback(callback, [deps])

子组件渲染频繁但 props 稳定？
  → React.memo(Component)

子组件渲染频繁，props 复杂但只需关注部分字段？
  → React.memo(Component, customComparator)
```

---

## 八、useRef 的另一种缓存用法

`useRef` 虽然不是缓存机制，但在某些场景下可替代 `useMemo`：

```tsx
// useRef 用于存储不需要触发渲染的值
const timerRef = useRef<number>();

// useMemo 用于存储需要触发渲染的计算结果
const doubleCount = useMemo(() => count * 2, [count]);

// ⚠️ useRef 也会保持引用不变，但更改 .current 不会触发重新渲染
timerRef.current = Date.now(); // 不触发渲染
```

---

## 九、实际代码示例

```tsx
// 完整示例：组合使用 memo + useCallback + useMemo
const ProductList = ({ categoryId, onSelect }: Props) => {
  // ✅ 缓存派生数据（昂贵计算）
  const filteredProducts = useMemo(() =>
    products.filter(p => p.categoryId === categoryId),
    [products, categoryId]
  );

  // ✅ 缓存排序（依赖数组稳定时避免重复计算）
  const sortedProducts = useMemo(() =>
    [...filteredProducts].sort((a, b) => a.price - b.price),
    [filteredProducts]
  );

  // ✅ 缓存稳定回调（配合 memo 的子组件）
  const handleSelect = useCallback((productId: number) => {
    onSelect(productId);
  }, [onSelect]);

  // ✅ 稳定配置对象
  const tableConfig = useMemo(() => ({
    pageSize: 20,
    showIndex: true,
  }), []);

  return (
    <div>
      <ProductTable
        products={sortedProducts}
        onSelect={handleSelect}
        config={tableConfig}
      />
    </div>
  );
};

// ProductTable 被 memo 包裹
const ProductTable = memo(({
  products,
  onSelect,
  config
}: {
  products: Product[];
  onSelect: (id: number) => void;
  config: TableConfig;
}) => {
  return (
    <table>
      <tbody>
        {products.map(p => (
          <ProductRow
            key={p.id}
            product={p}
            onSelect={onSelect}
            showIndex={config.showIndex}
          />
        ))}
      </tbody>
    </table>
  );
});
```

---

## 总结

| 问题 | 答案 |
|-----|------|
| memo 和 useCallback 必须组合使用吗？ | 不必须，但如果子组件用 memo 且接收函数 props，才需要 useCallback 稳定引用 |
| useMemo 的依赖数组怎么比较？ | `Object.is` 逐项比较 |
| memo 的 props 怎么比较？ | 同样 `Object.is` 逐项浅比较，不做深比较 |
| 什么时候不能用 memo？ | props 引用总在变化、组件频繁更新、内部有大量 state |
| 哪个性能开销最大？ | 深比较 > 自定义比较函数 > 浅比较 |

**核心原则：先 profile，再优化。不要盲目使用缓存机制。**
