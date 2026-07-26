/**
 * Simplified Chinese interface strings.
 *
 * Wording follows the original game's register: 居酒屋 vocabulary, 幻想乡 place
 * names, and the 料理 / 食材 / 酒水 terminology the Chinese wiki uses, so the
 * text reads as the same game rather than as a translation of one.
 */

export const ZH = {
  'title.start': '开门营业',
  'title.continue': '继续经营',
  'title.album': '献立帖',
  'title.settings': '设置',
  'title.tagline': '东方夜雀食堂',
  'title.disclaimer': '同人复刻作品 · 美术均为原创 · 与原作者无关',

  'hud.time': '营业时间',
  'hud.earnings': '营业额',
  'hud.combo': '连击',
  'hud.reputation': '评价',
  'hud.controls': 'WASD 走动 · E 交互 · 右键／K 投掷传菜 · Q 切换目标 · Esc 关闭',

  'station.empty': '空闲',
  'station.take': '取餐',
  'station.busy': '还在烹饪中。',

  'prompt.cook': '开始烹饪',
  'prompt.collect': '取餐',
  'prompt.busy': '烹饪中……',
  'prompt.pour': '倒酒',
  'prompt.serve': '上菜',

  'throw.hint': '右键／K 投掷',

  'tray.title': '托盘',
  'tray.empty': '手上什么都没有',
  'tray.pour': '去酒棚倒一杯',

  'cook.title': '烹饪',
  'cook.menu': '今夜的菜单',
  'cook.addHint': '最多可添加五种食材',
  'cook.pickFirst': '先选一道料理吧。',
  'cook.confirm': '开始烹饪',
  'cook.close': 'Esc 关闭',
  'cook.needsStation': '需要{station}',
  'cook.outOfStock': '食材不足',
  'cook.added': '已加 {count}/{max}',
  'cook.ruins': '会毁掉：{tags}',
  'cook.darkMatter': '{tags} 会让这道菜变成黑暗物质',

  'drinks.title': '倒一杯酒水',

  'msg.handsFull': '手上已经端满了。',
  'msg.cookFirst': '得先做点什么。',
  'msg.nothingToServe': '还没有可以上的菜。',
  'msg.needDrink': '还得配一杯酒水。',
  'msg.alreadyPoured': '酒水已经倒好了。',
  'msg.noRoom': '放不下更多了。',
  'msg.noneLeft': '{item}用完了。',
  'msg.missed': '客人已经走了，菜洒了一地。',

  'prep.title': '备菜',
  'prep.subtitle': '定下今夜的菜单、酒单与炊具，再开门迎客。',
  'prep.dishes': '菜单',
  'prep.drinks': '酒单',
  'prep.stations': '炊具',
  'prep.slots': '{used}/{max}',
  'prep.start': '开门营业',
  'prep.auto': '一键推荐',
  'prep.clear': '全部清空',
  'prep.day': '第 {day} 夜',
  'prep.level': '{level} 级',
  'prep.coverage': '今夜可提供的标签',
  'prep.noCoverage': '还没有选择任何料理。',
  'prep.warnNoStation': '{dish} 需要{station}，今夜没带。',
  'prep.warnNoStock': '{dish} 的食材不够了。',
  'prep.needDish': '至少要选一道料理。',
  'prep.needDrink': '至少要选一种酒水。',
  'prep.needStation': '至少要带一件炊具。',
  'prep.ready': '一切就绪，开门吧。',
  'prep.stock': '库存 {count}',
  'prep.cookTime': '{time}s',
  'prep.usedBy': '可做 {count} 道',
  'prep.hint': '空格开门营业 · Esc 返回',

  'rating.black': '暴怒',
  'rating.purple': '不满',
  'rating.green': '普通',
  'rating.orange': '满意',
  'rating.pink': '绝品',

  'note.black': '这是什么东西……？',
  'note.purple': '不是我想要的味道。',
  'note.green': '多谢款待，还不错。',
  'note.orange': '哦，这个好吃！',
  'note.pink': '太棒了——正合我意！',
  'note.overMinor': '稍微超出预算了……',
  'note.overMajor': '这也太贵了吧！',
  'note.impatient': '等太久了，不吃了。',

  'order.common': '来一份{dish}，配{drink}。',
  'order.rare': '今晚想来点{wants}。',
  'order.rareAny': '随便来点什么吧。',
  'order.wantDish': '{tag}的料理',
  'order.wantDrink': '{tag}的酒水',
  'order.join': '，再配上',

  'results.title': '今夜的账目',
  'results.revenue': '营业额',
  'results.tips': '小费',
  'results.served': '招待人数',
  'results.walkouts': '中途离席',
  'results.bestCombo': '最高连击',
  'results.continue': '打烊',

  'gallery.title': '登场人物',
  'gallery.subtitle': '同一套骨架绘制的 {count} 位角色',
} as const;
