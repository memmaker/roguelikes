
                             Welcome to MAG!

                                Ver PC-1.1


Installation
------------

There is no automatic installation program for MAG, but it's very simple to
setup manually.  First, create a MAG directory (called 'mag' let's say) and
then create three more directories inside 'mag' called 'pics', 'help' and
'save'.  The directory structure would look like:

    --- MAG ---- PICS
             |
             --- HELP
             |
             --- SAVE

MAG.EXE should go into the 'mag' directory.

HEADER., HEROBOX. and TOMB. should go into the 'pics' directory.

HELP.* should go into the 'help' directory.

The 'save' directory will be used for level files and saved game files.

Now you can play MAG by typing 'mag' while in the 'mag' directory.


What is MAG?
------------

MAG is a visual adventuring game where you (our hero) must delve deeply
into an ancient, abandoned dungeon.  There you must seek out the magical
Sudbury Sapphire and return safely back to the surface with it.


How do I play MAG?
------------------

Unfortunately (for you) I'm too lazy to write any real documentation for MAG.
But since there are so many similar games (Rogue, Hack) you shouldn't have
any problems picking this one up if you've played any of the others.  Use
the F1 key for a list of commands while you're playing.


Object of the Game
------------------

The object of MAG is to keep yourself (you being the hero, of course) alive
as you explore deeper and deeper levels of the dungeon until you come across
the Sudbury Sapphire.  The Sudbury Sapphire is currently in the possession
of a race of dragons who deem themselves to be the rulers of the Underworld.
Thus, they call themselves Imperial Dragons.  The Imperial Dragons are said
to keep their lair (and treasure) somewhere beyond the 20th level of the
dungeon.  So far, the depth of their lair has prevented many a sturdy
adventurer from recovering the Sapphire.  The dungeon is rumored to go MUCH
deeper then the Dragon's Lair but no one has yet ventured beyond.

The Sapphire itself is considered to be one of the strongest Good-aligned
magical forces in the world.  It is said to bring its possessor incredible
powers when used in the sunlight, but it has only a fraction of its power in
the darkness below ground.  The evil Imperial Dragons have always kept it at
a safe, DEEP dungeon level well below the surface.

Your job, should you choose to accept it, is to find the Sapphire and return
with it to the surface.


Creating an Option File
-----------------------

When MAG is executed it first looks in the current directory for a file
called 'options.mag'.  You can create this file with a text editor and put
inside it all of your personalized MAG configuration parameters.  This way,
each time you play MAG, it will automatically set all of your favorite
options.  A typical 'options.mag' file might look like:

        adventurer's name=Hagar the Slayer
        multi-search=10
        audible bell=no

but without the spaces before each line.  If you specify your warrior's name
inside the option file, then the title screen asking for your name will not
appear.  When playing MAG and type 'o' for options, a screen will appear
listing most of the options available.  This is what you would put in your
option file.  For example, on the option screen in MAG it says:

        'Audible bell.........YES'

so inside the 'options.mag' file you refer to this option as 'audible bell='
followed by a 'y' or 'n'.  All of the other options are the same way except
some take numbers after the '='.  There should be no spaces on either side
of the '='.

There are two options that can only be changed from inside an option file,
these are:

        screen mode=
and     save directory=

Screen mode can be 'monochrome', 'color', or 'mono color'.  The default is
'color' so if you are playing on a machine with a monochrome adaptor, you
MUST create an 'options.mag' file with this option set to 'monochrome'.

Save directory lets you specify where to put the save file and level files.
The default is a subdirectory called 'save' off of the current MAG direct-
ory.


Where did MAG come from?
------------------------

If you've ever played Rogue or Hack, then the theme above probably sounds
awfully familiar.  MAG, like Hack, is based on the original Rogue game
which I first encountered back in high school (Lincoln-Sudbury Regional)
in 1980 running on a DEC PDP 11/70 (Unix).  A person named Jay Fenlason,
who was also at Lincoln-Sudbury with me, wrote his own version of Rogue
which he called Hack (he wrote the original).  This prompted me to write a
version myself which ended up being called MAG (Mike's Adventure Game).  The
Unix version was pretty much completed in 1985 when I graduated.  In 1986,
while attending Northeastern University, I began a completely new (color)
version of MAG based on the IBM PC machines.  Finally, in 1988 I finished
it and here it is!


Modifying MAG
-------------

I have created MAG with absolutely no intention of selling it for profit,
and the source code should be included in this package.  

I encourage modifications and enhancements of MAG and have completely
commented the code to make it a little easier.  If you have enjoyed playing
MAG so much that you want to send me $10 or you have any questions, or 
suggestions send them to:

        Mike Teixeira
        6116 Savoy Circle
        Lutz, FL  33549

If you didn't get the source code and want a copy send me e-mail at:

        m.teixeira@worldnet.att.net
or
        mjteixeira@aol.com

You should probably send the message to both just to be sure!

Lastly, I'd like to thank my two testers, Lyman Sheats and Paul
Pennell, for finding bug after bug after bug.


                                --Mike Teixeira
