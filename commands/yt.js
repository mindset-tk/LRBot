// This file houses all the modules for playing audio through voice chat.
// Primarily it will play youtube audio, but with a little work it can be
// extended to other sources
const Discord = require('discord.js');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const YT = new YouTube(config.youTubeAPIKey);
const wait = require('util').promisify(setTimeout);

module.exports = {
  name: 'yt',
  description: 'Play any song or playlist from youtube in the voice channel you\'re currently in.',
  aliases: ['play'],
  usage: `video URL, or one of the following options: [play] [pause] [skip] [list [remove] [clear]].
**${config.prefix}yt (video URL)** adds the video to the end of the current playlist.
**${config.prefix}yt play** and **${config.prefix}yt pause** will unpause and pause playback, respectively. While paused the bot will wait 5 minutes before clearing the queue and leaving voice.
**${config.prefix}yt skip** will skip the current video.
**${config.prefix}yt list** by itself will list the current playlist.
**${config.prefix}yt list remove #** will remove the video at the numbered location in the playlist.
**${config.prefix}yt list clear** will clear the current playlist completely, but finish playback of the current song.
**${config.prefix}yt stop** will stop playback and clear the current playlist completely.

Volume can be set with the **${config.prefix}volume #** command, where # is a number between 1 and 100.

If the bot is not currently playing in a different channel, adding a video to the playlist will automatically summon the bot to the voice channel you are in.
The bot will not allow users who aren't in the same voice channel to edit the playlist.
If the bot is the only user in a voice channel, or finishes playback, it will automatically leave.`,
  guildOnly: true,
  cooldown: 0.1,
  async execute(message, args) {

    function formatDuration(APIDuration) {
      const duration = `${APIDuration.hours ? APIDuration.hours + ':' : ''}${
        APIDuration.minutes ? APIDuration.minutes : '00'
      }:${
        APIDuration.seconds < 10
          ? '0' + APIDuration.seconds
          : APIDuration.seconds
            ? APIDuration.seconds
            : '00'
      }`;
      return duration;
    }

    // Commands that can be permissibly used by a user that is in a different voice channel.
    const safeCommands = ['stop', 'list'];

    if (!config.voiceTextChannelIds.includes(message.channel.id)) {
      return message.channel.send('Please use this command only in the #voice-chat channels.');
    }
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel && args[0] != 'list') return message.channel.send('Please join a voice channel and try again!');
    if (message.guild.musicData.isPlaying == true && voiceChannel != message.guild.musicData.voiceChannel) {
      if (!safeCommands.includes(args[0])) {
        return message.channel.send(`Sorry, I'm already playing in another voice channel! I can only be in one voice channel at a time. The **${config.prefix}yt stop** command will forcibly end playback, but please be conscientious of other users!`);
      }
    }

    function playSong(queue) {
      message.guild.musicData.voiceChannel.join().then(connection =>{
        const dispatcher = connection
          .play(
            ytdl(queue[0].url, {
              // pass the url to .ytdl()
              quality: 'highestaudio',
              // download part of the song before playing it
              // helps reduces stuttering
              highWaterMark: 1024 * 1024 * 10,
            }),
          )
          .on('start', () => {
            message.guild.musicData.songDispatcher = dispatcher;
            message.guild.musicData.songDispatcher.pausedTime = null;
            dispatcher.setVolume(message.guild.musicData.volume);
            const videoEmbed = new Discord.MessageEmbed()
              .setThumbnail(queue[0].thumbnail)
              .setColor('#e9f931')
              .addField('Now Playing:', queue[0].title)
              .addField('Duration:', queue[0].duration);
            // also display next song title, if there is one in queue
            if (queue[1]) videoEmbed.addField('Next Song:', queue[1].title);
            message.guild.musicData.voiceTextChannel.send(videoEmbed);
            // dequeue the song.
            return message.guild.musicData.nowPlaying = queue.shift();
          })
          .on('finish', async () => {
            // if there are more songs in queue, continue playing
            if (queue.length >= 1) {
              return playSong(queue);
            }
            // else if there are no more songs in queue, leave the voice channel after 60 seconds.
            else {
              message.guild.musicData.volume = 1;
              message.guild.musicData.songDispatcher = null;
              message.guild.musicData.nowPlaying = null;
              message.guild.musicData.isPlaying = false;
              await wait(60000);
              if (!message.guild.musicData.isPlaying) { return voiceChannel.leave(); }
            }
          })
          .on('error', e => {
            message.guild.musicData.voiceTextChannel.send(`Could not play ${queue[0].title}. See console log for details. Skipping to next song...`);
            queue.shift();
            console.error(e);
            if (queue.length >= 1) {
              return playSong(queue);
            }
            else {
              message.guild.musicData.isPlaying = false;
              return voiceChannel.leave();
            }
          });
      }).catch(err => console.log(err));
    }

    const query = args.join(' ');
    // playlist ID will match isPlaylist[1]
    const isPlaylist = new RegExp(/(?:http(?:s)?:\/\/)?(?:(?:w){3}.)?youtu(?:be|.be)?(?:\.com)?\/(?:playlist\?).*\blist=(.+?)(?:&.*)?$/);
    // video ID will match isVideo[1] and playlistID will match isVideo[2]
    const isVideo = new RegExp(/(?:http(?:s)?:\/\/)?(?:(?:w){3}.)?youtu(?:be|.be)?(?:\.com)?\/(?:(?!playlist\?)(?:watch\?v=)?(.+?)(?:(?:#.+?)?|(?:&.+?)?)(?:&list=(.+?)(?:(?:#.+)?|(?:&.+)?))?)$/);
    if (query.match(isPlaylist) && args.length == 1) {
      // const playlist = await YT.getPlaylistByID(query.match(isPlaylist)[1]);
      message.channel.send('Sorry, that\'s a link to a playlist.  I can only add videos one at a time.');
      // message.channel.send(`Playlist title: ${playlist.title}`);
    }
    if (query.match(isVideo) && args.length == 1) {
      // Setting up song info object.
      // First, get the video data and insert it into a new song object
      const video = await YT.getVideoByID(query.match(isVideo)[1]);
      const url = video.url;
      const title = video.title;
      let duration = formatDuration(video.duration);
      const thumbnail = video.thumbnails.high.url;
      if (duration == '00:00') duration = 'Live Stream';
      const song = {
        url,
        title,
        duration,
        thumbnail,
      };
      // push the song into the queue.
      message.guild.musicData.queue.push(song);

      // not using YT playlists so this is debug stuff for now.
      // let playlist = null;
      // if (query.match(isVideo)[2]) { playlist = await YT.getPlaylistByID(query.match(isVideo)[2]); }
      // message.channel.send(`Video title: ${video.title} ${playlist ? `\n Playlist title: ${playlist.title}` : ''}`);
      // if nothing is playing yet
      if (!message.guild.musicData.isPlaying) {
        message.guild.musicData.volume = 1;
        message.guild.musicData.voiceTextChannel = message.channel;
        message.guild.musicData.voiceChannel = voiceChannel;
        message.guild.musicData.isPlaying = true;
        return playSong(message.guild.musicData.queue);
      }
      // if something is already playing
      else if (message.guild.musicData.isPlaying == true) {
        return message.channel.send(`:musical_note:  ${song.title} :musical_note: has been added to queue!`);
      }
    }
    if ((query.match(isPlaylist) || query.match(isPlaylist)) && args.length > 1) { return message.channel.send(`Too many arguments! Please try **${config.prefix}help yt** for help.`); }
    if (args[0].toLowerCase() == 'list' && !args[1]) {
      if (!message.guild.musicData.isPlaying) { return message.channel.send('Nothing is currently playing!'); }
      const titleArray = [];
      message.guild.musicData.queue.map(obj => {
        titleArray.push(obj.title);
      });
      const queueEmbed = new Discord.MessageEmbed()
        .setColor('#ff7373');
      const queueData = [`**Now Playing**: ${ message.guild.musicData.nowPlaying.title}`];
      if (titleArray.length == 0) {queueData.push('There are no songs in queue after the current song.'); }
      for (let i = 0; i < titleArray.length; i++) {
        queueData.push(`**${i + 1}.** ${titleArray[i]}`);
      }
      queueEmbed.addField('Music queue', queueData.join('\n'));
      return message.channel.send(queueEmbed);
    }
    else if (args[0].toLowerCase() == 'list' && args[1].toLowerCase() == 'clear') {
      message.guild.musicData.queue.length = 0;
      return message.channel.send('Cleared all songs queued after the current playing song.');
    }
    else if (args[0].toLowerCase() == 'list' && args[1].toLowerCase() == 'remove') {
      if (message.guild.musicData.queue.length == 0) {
        return message.channel.send('There are no songs in queue!');
      }
      if (args[2] && parseInt(args[2])) {
        if (parseInt(args[2]) > message.guild.musicData.queue.length) {
          return message.channel.send(`There are only ${ message.guild.musicData.queue.length} songs in queue!`);
        }
        const removeIdx = parseInt(args[2]) - 1;
        message.channel.send(`Removing ${message.guild.musicData.queue[removeIdx].title} from queue. Here is the new queue:`);
        message.guild.musicData.queue.splice(removeIdx, 1);
        const titleArray = [];
        message.guild.musicData.queue.map(obj => {
          titleArray.push(obj.title);
        });
        const queueEmbed = new Discord.MessageEmbed()
          .setColor('#ff7373');
        const queueData = [`**Now Playing**: ${ message.guild.musicData.nowPlaying.title}`];
        if (titleArray.length == 0) {queueData.push('There are no songs in queue after the current song.'); }
        for (let i = 0; i < titleArray.length; i++) {
          queueData.push(`**${i + 1}.** ${titleArray[i]}`);
        }
        queueEmbed.addField('Music queue', queueData.join('\n'));
        return message.channel.send(queueEmbed);
      }
      else { return message.channel.send(`Please specify a single number to be removed. Use **${config.prefix}yt list** to see queue numbers.`); }
    }
    else if (args[0].toLowerCase() == 'pause' && !args[1]) {
      if (!message.guild.musicData.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      if (message.guild.musicData.songDispatcher.paused) { return message.channel.send('Playback is already paused!'); }
      message.guild.musicData.songDispatcher.paused = true;
      message.channel.send('Song paused :pause_button:');
      message.guild.musicData.songDispatcher.pause();
      await wait(300000);
      if (message.guild.musicData.songDispatcher.pausedTime >= 290000) {
        message.guild.musicData.volume = 1;
        message.guild.musicData.queue.length = 0;
        message.guild.musicData.songDispatcher = null;
        message.guild.musicData.nowPlaying = null;
        message.guild.musicData.isPlaying = false;
        message.guild.musicData.voiceChannel.leave();
        message.guild.musicData.voiceChannel = null;
        return;
      }
    }
    else if ((args[0].toLowerCase() == 'play' || args[0].toLowerCase() == 'resume') && !args[1]) {
      if (!message.guild.musicData.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      if (!message.guild.musicData.songDispatcher.paused) { return message.channel.send('Playback is not paused!'); }
      message.guild.musicData.songDispatcher.paused = false;
      message.channel.send('Song resumed :play_pause:');
      return message.guild.musicData.songDispatcher.resume();
    }
    else if (args[0].toLowerCase() == 'skip' && !args[1]) {
      if (!message.guild.musicData.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      message.channel.send(`Skipping ${ message.guild.musicData.nowPlaying.title}...`);
      if (message.guild.musicData.queue.length < 1) {
        message.channel.send('Queue is empty. I will wait 1 minute before leaving the voice channel');
        message.guild.musicData.songDispatcher.pause();
        message.guild.musicData.isPlaying = false;
        await wait(60000);
        if (message.guild.musicData.isPlaying == false) {
          message.guild.musicData.volume = 1;
          message.guild.musicData.songDispatcher = null;
          message.guild.musicData.nowPlaying = null;
          message.guild.musicData.isPlaying = false;
          return voiceChannel.leave();
        }
      }
      return playSong(message.guild.musicData.queue);
    }
    else if (args[0].toLowerCase() == 'stop' && !args[1]) {
      if (!message.guild.musicData.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      message.channel.send('Stopping playback. Goodbye!');
      message.guild.musicData.volume = 1;
      message.guild.musicData.queue.length = 0;
      message.guild.musicData.isPlaying = false;
      message.guild.musicData.songDispatcher = null;
      message.guild.musicData.nowPlaying = null;
      message.guild.musicData.isPlaying = false;
      return message.guild.musicData.voiceChannel.leave();
    }
    else { return message.channel.send(`Invalid or too many arguments! Please try **${config.prefix}help yt** for help.`); }
  },
};