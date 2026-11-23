/**
 * Bundled emoji set: a curated ~250, grouped, each with a :shortcode: and search words (en + pt).
 * No CDN, no runtime fetch, nothing injected into the page (CSP-safe).
 */
export type EmojiCategory =
  'smileys' | 'people' | 'nature' | 'food' | 'activities' | 'travel' | 'objects' | 'symbols';

export interface EmojiEntry {
  char: string;
  code: string;
  words: string;
  category: EmojiCategory;
}

const RAW: Record<EmojiCategory, string> = {
  smileys: `
😀 grinning sorriso feliz|😃 smiley sorriso|😄 smile riso|😁 grin dentes|😆 laughing riso|😅 sweat_smile alivio|🤣 rofl gargalhada|😂 joy chorar_a_rir lol|🙂 slightly_smiling ok|🙃 upside_down ironia|😉 wink piscar|😊 blush corar|😇 innocent anjo|🥰 smiling_hearts amor|😍 heart_eyes apaixonado|🤩 star_struck uau|😘 kissing_heart beijo|😋 yum delicioso|😛 tongue lingua|😜 stuck_out_tongue_winking_eye maluco|🤪 zany doido|🤑 money_mouth dinheiro|🤗 hugs abraco|🤭 hand_over_mouth ups|🤫 shushing silencio|🤔 thinking pensar hmm|🤐 zipper_mouth calado|🤨 raised_eyebrow desconfiado|😐 neutral_face neutro|😑 expressionless|😶 no_mouth|😏 smirk|😒 unamused aborrecido|🙄 roll_eyes revirar|😬 grimacing|😮‍💨 exhale suspiro|😌 relieved aliviado|😔 pensive|😪 sleepy sono|😴 sleeping dormir|😷 mask doente|🤒 thermometer_face febre|🤢 nauseated enjoo|🤮 vomiting|🥵 hot calor|🥶 cold frio|🥴 woozy tonto|😵 dizzy|🤯 exploding_head mente_explodiu|🤠 cowboy|🥳 partying festa|😎 sunglasses fixe|🤓 nerd|🧐 monocle|😕 confused confuso|😟 worried preocupado|🙁 slightly_frowning|😮 open_mouth|😯 hushed|😲 astonished espantado|😳 flushed envergonhado|🥺 pleading por_favor|😦 frowning|😧 anguished|😨 fearful medo|😰 anxious|😥 sad_relieved|😢 cry chorar|😭 sob choro|😱 scream grito|😖 confounded|😣 persevere|😞 disappointed desiludido|😓 sweat|😩 weary cansado|😫 tired_face|🥱 yawning bocejo|😤 triumph|😡 rage furioso|😠 angry zangado|🤬 cursing palavroes|😈 smiling_imp diabinho|💀 skull caveira morto|💩 poop|🤡 clown palhaco|👻 ghost fantasma|👽 alien|🤖 robot robo`,
  people: `
👋 wave ola adeus|🤚 raised_back_of_hand|✋ hand mao|🖖 vulcan|👌 ok_hand|🤌 pinched_fingers italiano|✌️ v paz|🤞 crossed_fingers sorte|🤟 love_you|🤘 metal rock|🤙 call_me|👈 point_left|👉 point_right|👆 point_up|👇 point_down|☝️ point_up_2|👍 thumbsup +1 gosto sim|👎 thumbsdown -1 nao|✊ fist|👊 punch soco|👏 clap palmas|🙌 raised_hands viva|👐 open_hands|🤲 palms_up|🤝 handshake acordo|🙏 pray obrigado por_favor|💪 muscle forca|🧠 brain cerebro|👀 eyes olhos|👁️ eye|👶 baby bebe|🧑 person pessoa|👨 man homem|👩 woman mulher|🧓 older_person|🙋 raising_hand|🙆 ok_person|🙅 no_good|🤷 shrug sei_la|🤦 facepalm|💁 tipping_hand|🧑‍💻 technologist programador|🧑‍🍳 cook cozinheiro|🏃 runner correr|💃 dancer danca|🕺 man_dancing|👯 dancers`,
  nature: `
🐶 dog cao|🐱 cat gato|🐭 mouse rato|🐰 rabbit coelho|🦊 fox raposa|🐻 bear urso|🐼 panda|🐨 koala|🐯 tiger tigre|🦁 lion leao|🐮 cow vaca|🐷 pig porco|🐸 frog sapo|🐵 monkey macaco|🙈 see_no_evil|🙉 hear_no_evil|🙊 speak_no_evil|🐔 chicken galinha|🐧 penguin pinguim|🐦 bird passaro|🦆 duck pato|🦉 owl mocho|🐴 horse cavalo|🦄 unicorn unicornio|🐝 bee abelha|🦋 butterfly borboleta|🐌 snail caracol|🐢 turtle tartaruga|🐍 snake cobra|🐙 octopus polvo|🦀 crab caranguejo|🐟 fish peixe|🐬 dolphin golfinho|🐳 whale baleia|🦈 shark tubarao|🌵 cactus|🌲 tree arvore|🌴 palm_tree palmeira|🍀 four_leaf_clover trevo|🍁 maple_leaf folha|🌷 tulip|🌹 rose rosa|🌻 sunflower girassol|🌸 cherry_blossom flor|🌞 sun_with_face sol|🌝 full_moon_face|🌙 crescent_moon lua|⭐ star estrela|🌟 star2|⚡ zap raio|🔥 fire fogo|🌈 rainbow arco_iris|☀️ sunny sol|⛅ partly_sunny|🌧️ rain chuva|⛄ snowman neve|❄️ snowflake floco|🌊 ocean mar onda`,
  food: `
🍏 green_apple maca|🍎 apple|🍐 pear pera|🍊 orange laranja|🍋 lemon limao|🍌 banana|🍉 watermelon melancia|🍇 grapes uvas|🍓 strawberry morango|🍒 cherries cerejas|🍑 peach pessego|🥭 mango manga|🍍 pineapple ananas|🥥 coconut coco|🥝 kiwi|🍅 tomato tomate|🥑 avocado abacate|🥦 broccoli brocolos|🌶️ hot_pepper picante|🌽 corn milho|🥕 carrot cenoura|🧄 garlic alho|🧅 onion cebola|🥔 potato batata|🍞 bread pao|🥐 croissant|🥖 baguette|🧀 cheese queijo|🥚 egg ovo|🍳 cooking ovo_estrelado|🥓 bacon|🥩 cut_of_meat bife|🍗 poultry_leg frango|🍖 meat_on_bone|🌭 hotdog cachorro|🍔 hamburger|🍟 fries batatas_fritas|🍕 pizza|🥪 sandwich sande prego bifana|🌮 taco|🌯 burrito|🥗 salad salada|🍝 spaghetti massa|🍜 ramen|🍲 stew cozido|🍛 curry|🍣 sushi|🍤 fried_shrimp camarao|🐟 bacalhau|🍦 icecream gelado|🍰 cake bolo|🎂 birthday aniversario|🧁 cupcake|🥧 pie tarte|🍫 chocolate|🍬 candy|🍩 doughnut donut|🍪 cookie bolacha|🥜 peanuts|🍯 honey mel|🥛 milk leite|☕ coffee cafe bica|🍵 tea cha|🧃 juice sumo|🥤 cup_with_straw|🍺 beer cerveja imperial fino|🍻 beers saude|🥂 champagne brinde|🍷 wine vinho|🥃 tumbler whisky|🍸 cocktail|🍹 tropical_drink|🍾 champagne_bottle`,
  activities: `
⚽ soccer futebol bola|🏀 basketball|🏈 football|⚾ baseball|🎾 tennis tenis|🏐 volleyball voleibol|🏉 rugby|🎱 8ball|🏓 ping_pong|🏸 badminton|🥅 goal_net golo|⛳ golf|🏹 bow|🎣 fishing pesca|🥊 boxing|🥋 martial_arts|⛸️ ice_skate|🎿 ski|🏂 snowboarder|🏋️ weight_lifting ginasio|🤸 cartwheel|🚴 bike bicicleta|🏄 surfer surf|🏊 swimmer natacao|🧗 climbing escalada|🏆 trophy taca|🥇 first_place medalha|🥈 second_place|🥉 third_place|🏅 medal|🎖️ medal_military|🎗️ ribbon|🎫 ticket bilhete|🎟️ tickets|🎪 circus|🎭 theater teatro|🎨 art arte|🎬 clapper cinema|🎤 microphone karaoke|🎧 headphones musica|🎼 score|🎹 piano|🥁 drum bateria|🎷 saxophone|🎺 trumpet|🎸 guitar guitarra|🎻 violin|🎲 game_die dado|♟️ chess xadrez|🎯 dart alvo|🎳 bowling|🎮 video_game jogos|🧩 jigsaw puzzle|🎉 tada festa parabens|🎊 confetti|🎈 balloon balao|🎁 gift prenda|🎄 christmas_tree natal|🎃 jack_o_lantern halloween`,
  travel: `
🚗 car carro|🚕 taxi|🚌 bus autocarro|🚎 trolleybus|🏎️ racing_car|🚓 police_car|🚑 ambulance|🚒 fire_engine|🚲 bicycle|🛴 scooter trotinete|🏍️ motorcycle mota|🚨 rotating_light|🚃 railway_car|🚆 train comboio|🚇 metro|🚊 tram eletrico|✈️ airplane aviao|🚀 rocket foguetao|🛸 flying_saucer|🚁 helicopter|⛵ sailboat barco|🚤 speedboat|🛳️ ship navio|⚓ anchor|🗺️ map mapa|🗿 moyai|🗽 statue_of_liberty|🗼 tokyo_tower|🏰 castle castelo|🏟️ stadium estadio|🎡 ferris_wheel|🎢 roller_coaster|🏖️ beach praia|🏝️ island ilha|🏜️ desert|🌋 volcano|⛰️ mountain montanha|🏕️ camping campismo|🏠 house casa|🏢 office escritorio|🏥 hospital|🏦 bank|🏨 hotel|⛪ church igreja|🌃 night_city|🌅 sunrise|🌇 city_sunset por_do_sol|🌉 bridge ponte`,
  objects: `
⌚ watch relogio|📱 iphone telemovel|💻 computer portatil|⌨️ keyboard teclado|🖥️ desktop|🖨️ printer impressora|🖱️ mouse_three_button|💾 floppy_disk|📷 camera|📸 camera_flash foto|📹 video_camera|🎥 movie_camera|📺 tv|📻 radio|⏰ alarm_clock despertador|⌛ hourglass|💡 bulb ideia|🔦 flashlight|🕯️ candle vela|💸 money_with_wings|💵 dollar|💶 euro|💰 moneybag dinheiro|💳 credit_card|💎 gem diamante|🔧 wrench chave|🔨 hammer martelo|🛠️ tools ferramentas|⚙️ gear|🧲 magnet iman|💣 bomb bomba|🔪 knife faca|🛡️ shield escudo|🔮 crystal_ball|💊 pill comprimido|🩹 bandage penso|🧹 broom vassoura|🧻 roll_of_paper|🛒 shopping_cart compras|🎒 backpack mochila|👓 eyeglasses oculos|🕶️ dark_sunglasses|👕 shirt tshirt|👖 jeans|👟 sneaker tenis|👑 crown coroa|🎓 mortar_board|📚 books livros|📖 book livro|📝 memo nota|✏️ pencil lapis|📌 pushpin pin|📎 paperclip clip|📅 date calendario|📈 chart_with_upwards_trend subir|📉 chart_with_downwards_trend descer|📊 bar_chart grafico|🔒 lock cadeado|🔑 key chave_casa|🏷️ label etiqueta|📦 package caixa|✉️ email|📬 mailbox|🗑️ wastebasket lixo`,
  symbols: `
❤️ heart coracao amor|🧡 orange_heart|💛 yellow_heart|💚 green_heart|💙 blue_heart|💜 purple_heart|🖤 black_heart|🤍 white_heart|💔 broken_heart|❣️ heavy_heart_exclamation|💕 two_hearts|💖 sparkling_heart|💯 100 cem|💢 anger|💥 boom|💫 dizzy_star|💦 sweat_drops|💨 dash|💬 speech_balloon conversa|💭 thought_balloon|💤 zzz|✨ sparkles brilho|🎵 musical_note nota|➕ heavy_plus_sign mais|➖ heavy_minus_sign menos|✔️ heavy_check_mark|✅ white_check_mark feito|❌ x errado|❎ negative_squared_cross_mark|❓ question pergunta|❗ exclamation|‼️ bangbang|⚠️ warning aviso|🚫 no_entry_sign proibido|⛔ no_entry|🔴 red_circle|🟢 green_circle|🔵 blue_circle|🟡 yellow_circle|⚪ white_circle|⚫ black_circle|🆗 ok|🆕 new novo|🆒 cool|🆓 free gratis|🔝 top|🔜 soon|🇵🇹 portugal pt bandeira|🇪🇸 spain espanha|🇧🇷 brazil brasil|🇪🇺 eu europa|🏳️‍🌈 rainbow_flag|🏁 checkered_flag`,
};

export const EMOJI: EmojiEntry[] = (Object.keys(RAW) as EmojiCategory[]).flatMap((category) =>
  RAW[category]
    .trim()
    .split('|')
    .map((item) => {
      const [char, code, ...words] = item.trim().split(/\s+/);
      return {
        char: char!,
        code: code!,
        words: [code, ...words].join(' ').replace(/_/g, ' '),
        category,
      };
    }),
);

export const EMOJI_CATEGORIES = Object.keys(RAW) as EmojiCategory[];

const byCode = new Map(EMOJI.map((e) => [e.code, e.char]));

export const QUICK_REACTIONS = ['👍', '😂', '❤️', '🎉', '😮', '😢'];

/** Accent-insensitive search over shortcodes and words. */
export function searchEmoji(query: string, limit = 60): EmojiEntry[] {
  const q = fold(query);
  if (!q) return EMOJI.slice(0, limit);
  const starts = EMOJI.filter((e) => e.code.startsWith(q));
  const contains = EMOJI.filter((e) => !e.code.startsWith(q) && fold(e.words).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Replaces known :shortcodes: with their emoji (unknown ones are left as typed). */
export function expandShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_+-]{2,40}):/g, (whole, code: string) => byCode.get(code) ?? whole);
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
