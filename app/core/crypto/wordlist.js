/**
 * THE WORD LIST behind the optional passphrase slot.
 *
 * ## Why a word list at all
 *
 * The passphrase slot is offered to one person in one situation: the coach deciding he wants
 * the account provider outside the trust boundary. If he chooses it, the phrase is
 * APPLICATION-GENERATED rather than chosen by him, and it doubles as the written recovery
 * code — one artefact to keep safe rather than two.
 *
 * Application-generated is the entire point. A person-chosen passphrase has whatever entropy
 * that person happened to supply, which is unknowable and usually far less than it looks. A
 * phrase drawn uniformly from a known list has entropy that can be stated as a number, and a
 * number is what an honest security note needs.
 *
 * ## Ordinary words on purpose
 *
 * Every entry is a common, short, unambiguous English word. The phrase has to be written down
 * accurately by hand, read back off paper months later, and typed on a phone keyboard, so
 * plain words beat clever ones: nothing that sounds like another entry, nothing that needs
 * spelling out, nothing with an apostrophe or a hyphen.
 *
 * ## The selection is uniform, and that needs rejection sampling
 *
 * The list is not a power of two, so taking a random byte modulo the list length would make
 * the first few words very slightly more likely than the rest. The bias is small, and it is
 * also completely avoidable: `passphrase.js` discards values that fall outside the largest
 * whole multiple of the list length and draws again. Uniform is a property that can be
 * asserted; nearly-uniform is a property that can only be apologised for.
 */

/**
 * The words. Sorted, so a duplicate is visible to a human reader as well as to the test that
 * refuses one.
 *
 * @type {readonly string[]}
 */
export const WORDS = Object.freeze([
  'able', 'about', 'above', 'absent', 'accept', 'access', 'accord', 'account', 'ache', 'acid',
  'acorn', 'across', 'act', 'action', 'active', 'actor', 'adapt', 'add', 'adjust', 'admire',
  'admit', 'adopt', 'adult', 'advance', 'advice', 'affair', 'affect', 'afford', 'afraid', 'after',
  'again', 'age', 'agency', 'agent', 'agree', 'ahead', 'aim', 'air', 'airport', 'alarm',
  'album', 'alert', 'alike', 'alive', 'all', 'alley', 'allow', 'almond', 'almost', 'alone',
  'along', 'aloud', 'alpha', 'already', 'also', 'alter', 'always', 'amber', 'amount', 'ample',
  'amuse', 'anchor', 'ancient', 'angle', 'angry', 'animal', 'ankle', 'annual', 'answer', 'anthem',
  'anxious', 'any', 'apart', 'apology', 'appeal', 'appear', 'apple', 'apply', 'april', 'apron',
  'arch', 'area', 'argue', 'arise', 'arm', 'army', 'around', 'arrange', 'arrive', 'arrow',
  'art', 'artist', 'ash', 'aside', 'ask', 'asleep', 'aspect', 'assist', 'assume', 'atlas',
  'attach', 'attack', 'attend', 'auction', 'august', 'aunt', 'author', 'autumn', 'avenue', 'avoid',
  'awake', 'award', 'aware', 'away', 'awkward', 'axis', 'baby', 'back', 'bacon', 'badge',
  'bag', 'baker', 'balance', 'balcony', 'ball', 'balloon', 'banana', 'band', 'bank', 'banner',
  'bar', 'barley', 'barn', 'barrel', 'base', 'basic', 'basin', 'basket', 'bath', 'battery',
  'battle', 'bay', 'beach', 'beacon', 'bead', 'beam', 'bean', 'bear', 'beard', 'beast',
  'beat', 'beauty', 'become', 'bed', 'bee', 'beef', 'beetle', 'before', 'begin', 'behave',
  'behind', 'being', 'belief', 'bell', 'belong', 'below', 'belt', 'bench', 'bend', 'benefit',
  'berry', 'beside', 'best', 'better', 'between', 'beyond', 'bicycle', 'big', 'bill', 'bind',
  'bird', 'birth', 'biscuit', 'bishop', 'bit', 'bite', 'bitter', 'black', 'blade', 'blame',
  'blank', 'blanket', 'blast', 'blaze', 'blend', 'bless', 'blind', 'block', 'blond', 'blood',
  'bloom', 'blossom', 'blot', 'blouse', 'blow', 'blue', 'blur', 'board', 'boast', 'boat',
  'body', 'boil', 'bold', 'bolt', 'bond', 'bone', 'bonus', 'book', 'boost', 'boot',
  'border', 'boring', 'borrow', 'both', 'bottle', 'bottom', 'bounce', 'bound', 'bowl', 'box',
  'boy', 'brain', 'brake', 'branch', 'brand', 'brass', 'brave', 'bread', 'break', 'breath',
  'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring', 'brisk', 'broad', 'bronze', 'brook',
  'broom', 'brother', 'brown', 'brush', 'bubble', 'bucket', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bull', 'bunch', 'bundle', 'burden', 'burn', 'burst', 'bury', 'bus', 'bush',
  'busy', 'butter', 'button', 'buy', 'cabin', 'cable', 'cactus', 'cage', 'cake', 'calm',
  'camel', 'camera', 'camp', 'canal', 'candle', 'candy', 'cane', 'cannon', 'canoe', 'canvas',
  'canyon', 'cap', 'cape', 'captain', 'car', 'carbon', 'card', 'care', 'cargo', 'carpet',
  'carrot', 'carry', 'cart', 'carve', 'case', 'cash', 'castle', 'cat', 'catch', 'cattle',
  'cause', 'cave', 'cedar', 'celery', 'cell', 'cement', 'census', 'center', 'century', 'cereal',
  'certain', 'chain', 'chair', 'chalk', 'chamber', 'change', 'chapter', 'charge', 'charm', 'chart',
  'chase', 'cheap', 'check', 'cheek', 'cheer', 'cheese', 'chef', 'cherry', 'chess', 'chest',
  'chicken', 'chief', 'child', 'chill', 'chimney', 'chin', 'chip', 'choice', 'choose', 'chorus',
  'church', 'cider', 'cinema', 'circle', 'circus', 'citizen', 'city', 'civil', 'claim', 'clam',
  'clap', 'class', 'clay', 'clean', 'clear', 'clerk', 'clever', 'cliff', 'climb', 'clinic',
  'clip', 'clock', 'close', 'cloth', 'cloud', 'clover', 'club', 'clue', 'cluster', 'coach',
  'coal', 'coast', 'coat', 'cobra', 'cocoa', 'code', 'coffee', 'coin', 'cold', 'collar',
  'collect', 'colony', 'color', 'column', 'comb', 'combine', 'come', 'comedy', 'comfort', 'comic',
  'command', 'comment', 'common', 'compare', 'compass', 'compete', 'concert', 'concrete', 'condor', 'confirm',
  'connect', 'consent', 'consider', 'console', 'contain', 'content', 'contest', 'context', 'control', 'convert',
  'cook', 'cool', 'copper', 'copy', 'coral', 'cord', 'cork', 'corn', 'corner', 'correct',
  'cost', 'cottage', 'cotton', 'couch', 'cough', 'council', 'count', 'country', 'couple', 'courage',
  'course', 'court', 'cousin', 'cover', 'cow', 'crab', 'crack', 'cradle', 'craft', 'crane',
  'crash', 'crate', 'crawl', 'crazy', 'cream', 'create', 'credit', 'creek', 'crew', 'cricket',
  'crimson', 'crisp', 'crop', 'cross', 'crowd', 'crown', 'cruise', 'crumb', 'crush', 'crust',
  'crystal', 'cube', 'cuckoo', 'cup', 'curb', 'cure', 'curious', 'curl', 'current', 'curtain',
  'curve', 'cushion', 'custom', 'cut', 'cycle', 'dagger', 'daily', 'dairy', 'daisy', 'damage',
  'damp', 'dance', 'danger', 'dark', 'dash', 'data', 'date', 'daughter', 'dawn', 'day',
  'dead', 'deal', 'dear', 'debate', 'debt', 'decade', 'decide', 'deck', 'declare', 'decline',
  'decorate', 'deep', 'deer', 'defeat', 'defend', 'define', 'degree', 'delay', 'deliver', 'demand',
  'denim', 'dense', 'dentist', 'depart', 'depend', 'deposit', 'depth', 'desert', 'design', 'desk',
  'detail', 'detect', 'develop', 'device', 'devote', 'diagram', 'dial', 'diamond', 'diary', 'dice',
  'diesel', 'diet', 'differ', 'dig', 'dinner', 'direct', 'dirt', 'disagree', 'discover', 'dish',
  'dismiss', 'display', 'distance', 'divide', 'dizzy', 'dock', 'doctor', 'document', 'dog', 'doll',
  'dollar', 'dolphin', 'domain', 'donkey', 'door', 'dose', 'dot', 'double', 'doubt', 'dough',
  'dove', 'down', 'dozen', 'draft', 'dragon', 'drain', 'drama', 'draw', 'dream', 'dress',
  'drift', 'drill', 'drink', 'drive', 'drop', 'drum', 'dry', 'duck', 'dune', 'during',
  'dust', 'duty', 'dwarf', 'eager', 'eagle', 'ear', 'early', 'earn', 'earth', 'ease',
  'east', 'easy', 'eat', 'echo', 'edge', 'edit', 'effort', 'egg', 'eight', 'either',
  'elbow', 'elder', 'elect', 'element', 'elephant', 'eleven', 'else', 'embark', 'ember', 'embrace',
  'emerge', 'emotion', 'employ', 'empty', 'enable', 'enact', 'end', 'endless', 'endure', 'enemy',
  'energy', 'engage', 'engine', 'enjoy', 'enough', 'enrich', 'enroll', 'ensure', 'enter', 'entire',
  'entry', 'envelope', 'equal', 'equip', 'era', 'error', 'escape', 'essay', 'estate', 'evening',
  'event', 'ever', 'every', 'evidence', 'exact', 'exam', 'example', 'exceed', 'excess', 'exchange',
  'excite', 'excuse', 'exercise', 'exhibit', 'exist', 'exit', 'expand', 'expect', 'expense', 'expert',
  'explain', 'explore', 'export', 'expose', 'express', 'extend', 'extra', 'eye', 'fabric', 'face',
  'fact', 'factor', 'factory', 'fade', 'fail', 'faint', 'fair', 'faith', 'fall', 'false',
  'family', 'famous', 'fan', 'fancy', 'far', 'farm', 'fashion', 'fast', 'fat', 'father',
  'fault', 'favor', 'fear', 'feast', 'feather', 'feature', 'february', 'fee', 'feed', 'feel',
  'fellow', 'fence', 'fern', 'ferry', 'festival', 'fever', 'few', 'fiber', 'fiction', 'field',
  'fierce', 'fifteen', 'fifty', 'fig', 'fight', 'figure', 'file', 'fill', 'film', 'filter',
  'final', 'find', 'fine', 'finger', 'finish', 'fire', 'firm', 'first', 'fish', 'fist',
  'fit', 'five', 'fix', 'flag', 'flame', 'flash', 'flat', 'flavor', 'flee', 'fleet',
  'flesh', 'flight', 'float', 'flock', 'flood', 'floor', 'flour', 'flow', 'flower', 'fluid',
  'flute', 'fly', 'foam', 'focus', 'fog', 'fold', 'follow', 'food', 'fool', 'foot',
  'force', 'forest', 'forget', 'fork', 'form', 'fortune', 'forty', 'forward', 'fossil', 'foster',
  'found', 'fountain', 'four', 'fox', 'fragile', 'frame', 'free', 'freeze', 'fresh', 'friday',
  'friend', 'fringe', 'frog', 'front', 'frost', 'frown', 'fruit', 'fuel', 'full', 'fun',
  'funnel', 'funny', 'fur', 'furnish', 'future', 'gadget', 'gain', 'galaxy', 'gallery', 'game',
  'gap', 'garage', 'garden', 'garlic', 'gas', 'gate', 'gather', 'gauge', 'gaze', 'gear',
  'gender', 'general', 'gentle', 'genuine', 'gesture', 'ghost', 'giant', 'gift', 'giraffe', 'girl',
  'give', 'glad', 'glance', 'glass', 'glide', 'globe', 'gloom', 'glory', 'glove', 'glow',
  'glue', 'goal', 'goat', 'gold', 'golf', 'good', 'goose', 'gospel', 'govern', 'gown',
  'grab', 'grace', 'grade', 'grain', 'grand', 'granite', 'grape', 'graph', 'grasp', 'grass',
  'grave', 'gravity', 'gray', 'great', 'green', 'greet', 'grid', 'grief', 'grill', 'grin',
  'grip', 'grocery', 'ground', 'group', 'grove', 'grow', 'guard', 'guess', 'guest', 'guide',
  'guilt', 'guitar', 'gulf', 'gum', 'gutter', 'habit', 'hair', 'half', 'hall', 'hammer',
  'hand', 'handle', 'hang', 'happen', 'happy', 'harbor', 'hard', 'hare', 'harm', 'harvest',
  'hat', 'hatch', 'hate', 'haunt', 'have', 'hawk', 'hay', 'hazard', 'haze', 'head',
  'heal', 'health', 'heap', 'hear', 'heart', 'heat', 'heaven', 'heavy', 'hedge', 'heel',
  'height', 'helmet', 'help', 'hen', 'herb', 'herd', 'hero', 'hidden', 'hide', 'high',
  'hill', 'hint', 'hip', 'hire', 'history', 'hit', 'hobby', 'hockey', 'hold', 'hole',
  'holiday', 'hollow', 'holy', 'home', 'honest', 'honey', 'honor', 'hook', 'hope', 'horizon',
  'horn', 'horse', 'hospital', 'host', 'hotel', 'hour', 'house', 'human', 'humble', 'humor',
  'hundred', 'hunger', 'hunt', 'hurdle', 'hurry', 'hurt', 'husband', 'hut', 'ice', 'icon',
  'idea', 'ideal', 'identify', 'idle', 'ignore', 'ill', 'image', 'imagine', 'impact', 'import',
  'impose', 'improve', 'impulse', 'inch', 'include', 'income', 'indeed', 'index', 'indoor', 'infant',
  'inform', 'inherit', 'initial', 'injury', 'ink', 'inner', 'input', 'inquiry', 'insect', 'inside',
  'insist', 'inspect', 'install', 'instant', 'intend', 'interest', 'into', 'invent', 'invest', 'invite',
  'iron', 'island', 'issue', 'item', 'ivory', 'jacket', 'jaguar', 'jail', 'jam', 'january',
  'jar', 'jaw', 'jazz', 'jealous', 'jelly', 'jewel', 'job', 'join', 'joke', 'journey',
  'joy', 'judge', 'juice', 'july', 'jump', 'june', 'jungle', 'junior', 'jury', 'just',
  'keen', 'keep', 'kettle', 'key', 'kick', 'kid', 'kidney', 'kind', 'king', 'kiss',
  'kitchen', 'kite', 'kitten', 'knee', 'kneel', 'knife', 'knight', 'knock', 'knot', 'know',
  'label', 'labor', 'lace', 'ladder', 'lady', 'lake', 'lamb', 'lamp', 'land', 'lane',
  'language', 'lantern', 'lap', 'large', 'last', 'late', 'laugh', 'launch', 'laundry', 'law',
  'lawn', 'layer', 'lazy', 'lead', 'leaf', 'league', 'lean', 'leap', 'learn', 'lease',
  'least', 'leather', 'leave', 'lecture', 'left', 'leg', 'legal', 'legend', 'lemon', 'lend',
  'length', 'lens', 'leopard', 'lesson', 'letter', 'level', 'liberty', 'library', 'license', 'lid',
  'life', 'lift', 'light', 'like', 'lily', 'limb', 'lime', 'limit', 'line', 'link',
  'lion', 'lip', 'liquid', 'list', 'listen', 'little', 'live', 'lizard', 'load', 'loaf',
  'loan', 'lobby', 'local', 'lock', 'log', 'logic', 'lonely', 'long', 'look', 'loop',
  'loose', 'lord', 'lose', 'loss', 'lot', 'loud', 'lounge', 'love', 'low', 'loyal',
  'luck', 'luggage', 'lumber', 'lunar', 'lunch', 'lung', 'luxury', 'machine', 'mad', 'magic',
  'magnet', 'maid', 'mail', 'main', 'major', 'make', 'mammal', 'man', 'manage', 'mango',
  'mansion', 'manual', 'maple', 'marble', 'march', 'margin', 'marine', 'market', 'marry', 'marsh',
  'mask', 'mass', 'master', 'match', 'material', 'matter', 'may', 'maze', 'meadow', 'meal',
  'mean', 'measure', 'meat', 'medal', 'media', 'medical', 'meet', 'melody', 'melon', 'melt',
  'member', 'memory', 'mend', 'mention', 'menu', 'mercy', 'merge', 'merit', 'merry', 'mesh',
  'message', 'metal', 'method', 'middle', 'midnight', 'might', 'mild', 'mile', 'milk', 'mill',
  'mind', 'mine', 'mineral', 'minor', 'minute', 'mirror', 'miss', 'mist', 'mix', 'mobile',
  'model', 'modern', 'modest', 'moment', 'monday', 'money', 'monitor', 'monkey', 'month', 'mood',
  'moon', 'moral', 'more', 'morning', 'most', 'mother', 'motion', 'motor', 'mount', 'mouse',
  'mouth', 'move', 'movie', 'much', 'mud', 'mug', 'mule', 'multiply', 'muscle', 'museum',
  'music', 'must', 'mustard', 'mutual', 'myself', 'mystery', 'nail', 'name', 'napkin', 'narrow',
  'nation', 'native', 'nature', 'navy', 'near', 'neat', 'neck', 'need', 'needle', 'neighbor',
  'nephew', 'nerve', 'nest', 'net', 'network', 'never', 'new', 'news', 'next', 'nice',
  'night', 'nine', 'noble', 'nod', 'noise', 'none', 'noon', 'normal', 'north', 'nose',
  'note', 'nothing', 'notice', 'novel', 'november', 'now', 'nowhere', 'number', 'nurse', 'nut',
  'oak', 'oar', 'oasis', 'obey', 'object', 'observe', 'obtain', 'ocean', 'october', 'odd',
  'offer', 'office', 'often', 'oil', 'old', 'olive', 'once', 'onion', 'only', 'open',
  'opera', 'opinion', 'oppose', 'option', 'orange', 'orbit', 'orchard', 'order', 'organ', 'origin',
  'other', 'ounce', 'outdoor', 'outer', 'output', 'outside', 'oval', 'oven', 'over', 'owl',
  'own', 'oxygen', 'oyster', 'pace', 'pack', 'page', 'pain', 'paint', 'pair', 'palace',
  'pale', 'palm', 'pan', 'panda', 'panel', 'panic', 'paper', 'parade', 'parcel', 'parent',
  'park', 'parrot', 'part', 'party', 'pass', 'past', 'pasta', 'patch', 'path', 'patient',
  'pattern', 'pause', 'pave', 'pay', 'peace', 'peach', 'peak', 'peanut', 'pear', 'pearl',
  'pebble', 'pedal', 'pen', 'pencil', 'people', 'pepper', 'perfect', 'perform', 'perhaps', 'period',
  'permit', 'person', 'pet', 'phase', 'phone', 'photo', 'phrase', 'piano', 'pick', 'picnic',
  'picture', 'piece', 'pier', 'pig', 'pigeon', 'pile', 'pillow', 'pilot', 'pin', 'pine',
  'pink', 'pint', 'pioneer', 'pipe', 'pitch', 'pizza', 'place', 'plain', 'plan', 'planet',
  'plank', 'plant', 'plastic', 'plate', 'play', 'please', 'pledge', 'plenty', 'plot', 'plow',
  'plum', 'plunge', 'pocket', 'poem', 'poet', 'point', 'polar', 'pole', 'police', 'polish',
  'polite', 'pond', 'pony', 'pool', 'poor', 'popular', 'porch', 'port', 'position', 'possible',
  'post', 'pot', 'potato', 'pottery', 'pouch', 'pound', 'pour', 'powder', 'power', 'praise',
  'pray', 'predict', 'prefer', 'prepare', 'present', 'press', 'pretty', 'prevent', 'price', 'pride',
  'primary', 'prince', 'print', 'prior', 'prison', 'private', 'prize', 'problem', 'process', 'produce',
  'profit', 'program', 'project', 'promise', 'proof', 'proper', 'propose', 'protect', 'proud', 'prove',
  'public', 'pudding', 'pull', 'pulse', 'pump', 'pumpkin', 'punch', 'pupil', 'puppy', 'purchase',
  'pure', 'purple', 'purpose', 'purse', 'push', 'puzzle', 'pyramid', 'quality', 'quarter', 'queen',
  'question', 'queue', 'quick', 'quiet', 'quilt', 'quit', 'quiz', 'quote', 'rabbit', 'race',
  'rack', 'radar', 'radio', 'radish', 'raft', 'rail', 'rain', 'raise', 'rally', 'ranch',
  'random', 'range', 'rank', 'rapid', 'rare', 'rate', 'rather', 'ratio', 'raven', 'raw',
  'razor', 'reach', 'read', 'ready', 'real', 'reason', 'rebel', 'recall', 'receive', 'recipe',
  'record', 'recover', 'red', 'reduce', 'reef', 'refer', 'reflect', 'reform', 'refuse', 'region',
  'regret', 'regular', 'reject', 'relax', 'release', 'relief', 'rely', 'remain', 'remind', 'remove',
  'render', 'renew', 'rent', 'repair', 'repeat', 'reply', 'report', 'request', 'require', 'rescue',
  'research', 'reserve', 'resist', 'resource', 'respect', 'respond', 'rest', 'result', 'retain', 'retire',
  'return', 'reveal', 'review', 'reward', 'rhythm', 'ribbon', 'rice', 'rich', 'ride', 'ridge',
  'rifle', 'right', 'rigid', 'ring', 'rinse', 'ripe', 'rise', 'risk', 'ritual', 'river',
  'road', 'roast', 'robin', 'robot', 'rock', 'rocket', 'rod', 'role', 'roll', 'roof',
  'room', 'root', 'rope', 'rose', 'rough', 'round', 'route', 'row', 'royal', 'rubber',
  'ruby', 'rug', 'rule', 'run', 'rural', 'rush', 'rust', 'sacred', 'saddle', 'safe',
  'sail', 'salad', 'salmon', 'salt', 'same', 'sample', 'sand', 'satisfy', 'saturday', 'sauce',
  'save', 'saw', 'say', 'scale', 'scan', 'scarf', 'scatter', 'scene', 'schedule', 'scheme',
  'school', 'science', 'scissors', 'scope', 'score', 'scout', 'scrap', 'screen', 'script', 'scrub',
  'sculpture', 'sea', 'seal', 'search', 'season', 'seat', 'second', 'secret', 'section', 'secure',
  'seed', 'seek', 'seem', 'select', 'sell', 'senate', 'send', 'senior', 'sense', 'sentence',
  'separate', 'series', 'serious', 'serve', 'service', 'session', 'settle', 'seven', 'severe', 'shade',
  'shadow', 'shaft', 'shake', 'shallow', 'shame', 'shape', 'share', 'shark', 'sharp', 'shed',
  'sheep', 'sheet', 'shelf', 'shell', 'shelter', 'shield', 'shift', 'shine', 'ship', 'shirt',
  'shock', 'shoe', 'shoot', 'shop', 'shore', 'short', 'shoulder', 'shout', 'show', 'shower',
  'shrimp', 'shrink', 'shrug', 'shuffle', 'shut', 'shy', 'sibling', 'sick', 'side', 'siege',
  'sight', 'sign', 'silent', 'silk', 'silly', 'silver', 'similar', 'simple', 'since', 'sing',
  'single', 'sink', 'sir', 'sister', 'sit', 'six', 'size', 'skate', 'sketch', 'ski',
  'skill', 'skin', 'skirt', 'skull', 'sky', 'slab', 'slate', 'sleep', 'sleeve', 'slice',
  'slide', 'slight', 'slim', 'slip', 'slope', 'slot', 'slow', 'small', 'smart', 'smell',
  'smile', 'smoke', 'smooth', 'snack', 'snake', 'snap', 'sneeze', 'snow', 'soap', 'soccer',
  'social', 'sock', 'soda', 'sofa', 'soft', 'soil', 'solar', 'soldier', 'solid', 'solve',
  'some', 'son', 'song', 'soon', 'sorry', 'sort', 'soul', 'sound', 'soup', 'source',
  'south', 'space', 'spare', 'spark', 'speak', 'special', 'speech', 'speed', 'spell', 'spend',
  'sphere', 'spice', 'spider', 'spike', 'spin', 'spine', 'spirit', 'split', 'spoil', 'sponge',
  'spoon', 'sport', 'spot', 'spray', 'spread', 'spring', 'spy', 'square', 'squeeze', 'squirrel',
  'stable', 'stack', 'stadium', 'staff', 'stage', 'stairs', 'stamp', 'stand', 'star', 'start',
  'state', 'station', 'stay', 'steady', 'steam', 'steel', 'steep', 'steer', 'stem', 'step',
  'stick', 'still', 'sting', 'stir', 'stock', 'stomach', 'stone', 'stool', 'stop', 'store',
  'storm', 'story', 'stove', 'straight', 'strange', 'straw', 'stream', 'street', 'stretch', 'strike',
  'string', 'strip', 'strong', 'studio', 'study', 'stuff', 'stumble', 'style', 'subject', 'submit',
  'subway', 'succeed', 'such', 'sudden', 'suffer', 'sugar', 'suggest', 'suit', 'summer', 'sun',
  'sunday', 'sunset', 'super', 'supply', 'support', 'suppose', 'sure', 'surface', 'surge', 'surprise',
  'surround', 'survey', 'suspect', 'sustain', 'swallow', 'swamp', 'swan', 'swap', 'swarm', 'sweater',
  'sweep', 'sweet', 'swell', 'swift', 'swim', 'swing', 'switch', 'sword', 'symbol', 'syrup',
  'system', 'table', 'tackle', 'tag', 'tail', 'tailor', 'take', 'tale', 'talent', 'talk',
  'tall', 'tank', 'tap', 'tape', 'target', 'task', 'taste', 'tax', 'tea', 'teach',
  'team', 'tear', 'tell', 'temple', 'tenant', 'tennis', 'tent', 'term', 'test', 'text',
  'thank', 'theme', 'theory', 'thick', 'thin', 'thing', 'think', 'third', 'thirty', 'thousand',
  'thread', 'three', 'throat', 'throne', 'through', 'throw', 'thumb', 'thunder', 'thursday', 'ticket',
  'tide', 'tidy', 'tiger', 'tight', 'tile', 'timber', 'time', 'tin', 'tiny', 'tip',
  'tire', 'title', 'toast', 'today', 'toe', 'together', 'toilet', 'token', 'tomato', 'tomorrow',
  'tone', 'tongue', 'tonight', 'tool', 'tooth', 'top', 'topic', 'torch', 'total', 'touch',
  'tough', 'tour', 'toward', 'towel', 'tower', 'town', 'toy', 'trace', 'track', 'trade',
  'traffic', 'trail', 'train', 'transfer', 'trap', 'travel', 'tray', 'treat', 'tree', 'trend',
  'trial', 'tribe', 'trick', 'trigger', 'trim', 'trip', 'triumph', 'trolley', 'trophy', 'tropic',
  'trouble', 'truck', 'true', 'trumpet', 'trunk', 'trust', 'truth', 'try', 'tube', 'tuesday',
  'tulip', 'tumble', 'tuna', 'tunnel', 'turkey', 'turn', 'turtle', 'twelve', 'twenty', 'twice',
  'twin', 'twist', 'two', 'type', 'ugly', 'umbrella', 'uncle', 'under', 'unfold', 'uniform',
  'union', 'unique', 'unit', 'unite', 'universe', 'unknown', 'unless', 'until', 'unusual', 'upon',
  'upper', 'upset', 'urban', 'urge', 'usage', 'use', 'useful', 'usual', 'utility', 'vacant',
  'vacuum', 'valid', 'valley', 'value', 'valve', 'van', 'vanish', 'vapor', 'variety', 'vast',
  'vault', 'vegetable', 'vehicle', 'velvet', 'vendor', 'venture', 'verb', 'verify', 'verse', 'version',
  'vessel', 'veteran', 'via', 'victory', 'video', 'view', 'village', 'vinegar', 'violet', 'violin',
  'virtue', 'visible', 'vision', 'visit', 'visual', 'vital', 'vivid', 'vocal', 'voice', 'void',
  'volcano', 'volume', 'vote', 'voyage', 'wage', 'wagon', 'waist', 'wait', 'wake', 'walk',
  'wall', 'walnut', 'wander', 'want', 'war', 'warm', 'warn', 'wash', 'waste', 'watch',
  'water', 'wave', 'wax', 'way', 'weak', 'wealth', 'weapon', 'wear', 'weather', 'weave',
  'wedding', 'wednesday', 'weed', 'week', 'weigh', 'welcome', 'well', 'west', 'wet', 'whale',
  'wheat', 'wheel', 'when', 'where', 'which', 'while', 'whisper', 'whistle', 'white', 'whole',
  'why', 'wide', 'widow', 'width', 'wife', 'wild', 'will', 'willow', 'win', 'wind',
  'window', 'wine', 'wing', 'winter', 'wire', 'wisdom', 'wise', 'wish', 'witness', 'wolf',
  'wonder', 'wood', 'wool', 'word', 'work', 'world', 'worry', 'worth', 'wound', 'wrap',
  'wreck', 'wrist', 'write', 'wrong', 'yard', 'yawn', 'year', 'yellow', 'yes', 'yesterday',
  'yet', 'yield', 'yogurt', 'young', 'youth', 'zebra', 'zero', 'zone', 'zoo',
]);

/**
 * How many words a generated phrase carries.
 *
 * Six, as specified. One artefact serving as both the passphrase and the written recovery
 * code has to be short enough that a person actually writes it down accurately, and six words
 * is the point where that stops being a chore.
 */
export const PHRASE_WORDS = 6;

/**
 * Entropy of a generated phrase, in bits, computed rather than claimed.
 *
 * COMPUTED and not written down as a number, because the honest figure is a property of the
 * list's actual length. If a word is ever added or removed, this moves with it — whereas a
 * constant would keep asserting yesterday's figure and nothing would notice.
 */
export const PHRASE_ENTROPY_BITS = Math.log2(WORDS.length) * PHRASE_WORDS;
